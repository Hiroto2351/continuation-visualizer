#lang racket

;; 式を文字列表現に変換
(define (expr->string expr)
  (cond
    [(list? expr)
     (string-join (map (lambda (e) (format "~a" e)) expr) " ")]
    [else (format "~a" expr)]))

;; ===== 名前空間の管理 =====
;; ユーザー定義関数名を収集
(define function-names (make-hash))
;; 関数名 -> 本体の式のマッピング
(define function-bodies (make-hash))
;; 継続パラメータ名を収集（call/cc, shiftでキャプチャされたもの）
(define continuation-names (make-hash))
;; 変数名を収集
(define variable-names (make-hash))
;; trace用の変数名
(define traced-vars (make-hash))

;; 式を事前スキャンして継続パラメータを収集
(define (collect-continuation-params expr)
  (cond
    ;; call/cc の場合
    [(and (list? expr)
          (>= (length expr) 2)
          (eq? (car expr) 'call/cc))
     (let* ([lambda-expr (cadr expr)]
            [k-param (caadr lambda-expr)]
            [body-exprs (cddr lambda-expr)])
       (hash-set! continuation-names k-param #t)
       (for-each collect-continuation-params body-exprs))]

    ;; shift の場合
    [(and (list? expr)
          (>= (length expr) 3)
          (eq? (car expr) 'shift))
     (let* ([k-param (cadr expr)]
            [body-exprs (cddr expr)])
       (hash-set! continuation-names k-param #t)
       (for-each collect-continuation-params body-exprs))]

    ;; define 関数定義の場合
    [(and (list? expr)
          (>= (length expr) 3)
          (eq? (car expr) 'define)
          (list? (cadr expr)))
     (collect-continuation-params (caddr expr))]

    ;; define 変数定義で継続を含む式を束縛する場合
    [(and (list? expr)
          (>= (length expr) 3)
          (eq? (car expr) 'define)
          (symbol? (cadr expr)))
     (let ([var-name (cadr expr)]
           [value-expr (caddr expr)])
       ;; 値の式をスキャン
       (collect-continuation-params value-expr)
       ;; reset, call/cc, shiftを含む場合は継続変数として登録
       (when (contains-continuation-form? value-expr)
         (hash-set! continuation-names var-name #t)))]

    ;; let の場合、束縛を収集
    [(and (list? expr)
          (>= (length expr) 3)
          (eq? (car expr) 'let))
     (let* ([bindings (cadr expr)]
            [body (caddr expr)])
       (for-each (lambda (binding)
                   (when (list? binding)
                     (let ([var-name (car binding)]
                           [value-expr (cadr binding)])
                       (hash-set! variable-names var-name #t)
                       (collect-continuation-params value-expr)
                       ;; 継続を含む式の場合は継続変数として登録
                       (when (contains-continuation-form? value-expr)
                         (hash-set! continuation-names var-name #t)))))
                 bindings)
       (collect-continuation-params body))]

    ;; リストの場合、再帰的に探索
    [(list? expr)
     (for-each collect-continuation-params expr)]

    ;; それ以外は何もしない
    [else (void)]))

;; 式が継続フォーム（reset, call/cc, shift）を含むか判定
(define (contains-continuation-form? expr)
  (cond
    [(not (list? expr)) #f]
    [(null? expr) #f]
    [(member (car expr) '(reset call/cc shift)) #t]
    [else (ormap contains-continuation-form? expr)]))
;; トップレベルの定義を処理
(define (transform-toplevel expr)
  (cond
    ;; define 関数定義
    [(and (list? expr)
          (>= (length expr) 3)
          (eq? (car expr) 'define)
          (list? (cadr expr)))
     (let* ([name-and-params (cadr expr)]
            [func-name (car name-and-params)]
            [params (cdr name-and-params)]
            [body (caddr expr)])
       (hash-set! function-names func-name #t)
       (hash-set! function-bodies func-name body)
       `(define (,func-name ,@params)
          ,(transform-expr body)))]

    ;; define 変数定義
    [(and (list? expr)
          (>= (length expr) 3)
          (eq? (car expr) 'define)
          (symbol? (cadr expr)))
     (let ([var-name (cadr expr)]
           [value-expr (caddr expr)])
       `(define ,var-name ,(transform-expr value-expr)))]

    ;; その他のトップレベル式
    [else (transform-expr expr)]))

;; 式を変換（ログ付きバージョンに）
(define (transform-expr expr)
  (cond
    ;; call/cc の変換
    [(and (list? expr)
          (>= (length expr) 2)
          (eq? (car expr) 'call/cc))
     (let* ([lambda-expr (cadr expr)]
            [k-param (caadr lambda-expr)]
            [body-exprs (cddr lambda-expr)]  ; lambda本体の全ての式
            [marks-var (string->symbol (format "~a-marks" (symbol->string k-param)))]
            [transformed-body (if (= (length body-exprs) 1)
                                  (let ([body (car body-exprs)])
                                    (if (and (list? body) (eq? (car body) 'begin))
                                        `(begin ,@(map transform-expr (cdr body)))
                                        (transform-expr body)))
                                  `(begin ,@(map transform-expr body-exprs)))])
       `(with-continuation-mark key "call/cc"
          (begin
            (log-push "call/cc")
            (log-pop "call/cc"
                     (call/cc
                      (lambda (,k-param)
                        (let ([marks (continuation-mark-set->list (current-continuation-marks) key)])
                          (displayln (format "capture: ~a ~a" ',k-param marks))
                          (let ([,marks-var marks])
                            ,transformed-body))))))))]

    ;; set! の変換（continuation-markを表示）
    [(and (list? expr)
          (= (length expr) 3)
          (eq? (car expr) 'set!))
     (let* ([var (cadr expr)]
            [val (caddr expr)])
       (if (and (symbol? val)
                (hash-has-key? continuation-names val))
           ;; valが継続パラメータの場合
           (let ([marks-var (string->symbol (format "~a-marks" (symbol->string val)))])
             `(begin
                (displayln (format "set: ~a => ~a (marks: ~a)" ',var ',val ,marks-var))
                (set! ,var ,val)))
           ;; それ以外の場合
           `(begin
              (let ([marks (continuation-mark-set->list (current-continuation-marks) key)])
                (displayln (format "set: ~a => ~a (marks: ~a)" ',var ,(transform-expr val) marks)))
              (set! ,var ,(transform-expr val)))))]

    ;; begin の変換
    [(and (list? expr)
          (not (null? expr))
          (eq? (car expr) 'begin))
     `(begin ,@(map transform-expr (cdr expr)))]

    ;; reset の変換
    [(and (list? expr)
          (= (length expr) 2)
          (eq? (car expr) 'reset))
     (let ([body (cadr expr)])
       `(with-continuation-mark key "reset"
          (begin
            (log-push "reset")
            (let ([marks (continuation-mark-set->list (current-continuation-marks) key)])
              (displayln (format "reset: ~a" marks))
              (log-pop "reset"
                       (reset
                        ,(transform-expr body)))))))]

    ;; shift の変換
    [(and (list? expr)
          (>= (length expr) 3)
          (eq? (car expr) 'shift))
     (let* ([k-param (cadr expr)]
            [body-exprs (cddr expr)]  ; shift本体の全ての式
            [label (format "shift ~a" k-param)]
            [marks-var (string->symbol (format "~a-marks" k-param))]
            [transformed-body (if (= (length body-exprs) 1)
                                  (let ([body (car body-exprs)])
                                    (if (and (list? body) (eq? (car body) 'begin))
                                        `(begin ,@(map transform-expr (cdr body)))
                                        (transform-expr body)))
                                  `(begin ,@(map transform-expr body-exprs)))])
       `(with-continuation-mark key ,label
          (begin
            (log-push ,label)
            (let ([marks (continuation-mark-set->list (current-continuation-marks) key)])
              (displayln (format "shift: ~a ~a" ',k-param marks))
              (log-pop ,label
                       (shift ,k-param
                              (let ([,marks-var marks])
                                ,transformed-body)))))))]

    ;; 継続の呼び出し (k-param value) の変換
    ;; 継続パラメータとして登録されているものだけを継続呼び出しとして扱う
    [(and (list? expr)
          (= (length expr) 2)
          (symbol? (car expr))
          (hash-has-key? continuation-names (car expr)))
     (let* ([k-param (car expr)]
            [value (cadr expr)]
            [k-param-str (symbol->string k-param)]
            [k-param-marks (string->symbol (format "~a-marks" k-param-str))]
            [label (format "~a ~a" k-param value)]
            [value-str (if (and (list? value) (eq? (car value) 'lambda))
                           (format "'~s" value)
                           (format "~a" value))])
       `(with-continuation-mark key ,label
          (begin
            (log-push ,label)
            (trace ,k-param)
            (let* ([val ,(transform-expr value)]
                   [val-display (if (procedure? val)
                                    ,value-str
                                    val)])
              (displayln (format "call: ~a (value:~a,marks:~a)"
                                 ',k-param
                                 val-display
                                 ,k-param-marks))
              (log-pop ,label (,k-param val))))))]

    ;; + などの演算子の変換
    [(and (list? expr)
          (not (null? expr))
          (member (car expr) '(+ - * /)))
     (let* ([op (car expr)]
            [args (cdr expr)]
            ;; リテラル（数値など）を探す。なければ最初の引数
            [label-arg (if (null? args)
                           ""
                           (let loop ([remaining args])
                             (cond
                               [(null? remaining) (car args)]
                               [(not (list? (car remaining))) (car remaining)]
                               [else (loop (cdr remaining))])))]
            [label (format "~a ~a" op label-arg)])
       `(with-continuation-mark key ,label
          (begin
            (log-push ,label)
            (log-pop ,label
                     (,op ,@(map transform-expr args))))))]

    ;; lambda の変換
    [(and (list? expr)
          (not (null? expr))
          (eq? (car expr) 'lambda))
     `(lambda ,(cadr expr)
        ,(transform-expr (caddr expr)))]

    ;; let の変換
    [(and (list? expr)
          (not (null? expr))
          (eq? (car expr) 'let))
     (let* ([bindings (cadr expr)]
            [body (caddr expr)]
            [transformed-bindings (map (lambda (binding)
                                         (list (car binding)
                                               (transform-expr (cadr binding))))
                                       bindings)])
       `(let ,transformed-bindings
          ,(transform-expr body)))]

    ;; ユーザー定義関数の呼び出し
    [(and (list? expr)
          (not (null? expr))
          (symbol? (car expr))
          (hash-has-key? function-names (car expr)))
     (let* ([func-name (car expr)]
            [args (cdr expr)])
       (if (null? args)
           `(,func-name)
           `(,func-name ,@(map transform-expr args))))]

    ;; 変数の呼び出し（トップレベルの式として使われている場合）
    [(and (list? expr)
          (not (null? expr))
          (symbol? (car expr))
          (not (hash-has-key? function-names (car expr)))
          (not (member (car expr) '(+ - * / call/cc set! begin lambda let))))
     (let ([var-name (car expr)])
       (hash-set! traced-vars var-name #t)
       (map transform-expr expr))]

    ;; その他のリスト
    [(list? expr)
     (map transform-expr expr)]

    ;; アトミックな値
    [else expr]))

;; 式で使用される関数を再帰的に抽出
(define (extract-all-functions expr)
  (define result (make-hash))

  (define (collect-functions e)
    (cond
      [(not (list? e)) (void)]
      [(null? e) (void)]
      [(and (symbol? (car e))
            (hash-has-key? function-names (car e)))
       (let ([func-name (car e)])
         (unless (hash-has-key? result func-name)
           (hash-set! result func-name #t)
           ;; その関数の本体も調べる
           (when (hash-has-key? function-bodies func-name)
             (collect-functions (hash-ref function-bodies func-name))))
         ;; 引数も調べる
         (for-each collect-functions (cdr e)))]
      [else
       (for-each collect-functions e)]))

  (collect-functions expr)
  (hash-keys result))

;; 式で使用される関数/変数を抽出
(define (extract-called-symbols expr)
  (define funcs (extract-all-functions expr))
  (define vars '())

  (define (collect-vars e)
    (cond
      [(not (list? e)) (void)]
      [(null? e) (void)]
      [(and (symbol? (car e))
            (hash-has-key? traced-vars (car e)))
       (set! vars (cons (car e) vars))]
      [else (void)]))

  (collect-vars expr)
  (append funcs vars))

;; メインの変換関数（複数のトップレベル式に対応）
(define (transform-code exprs)
  ;; 事前にすべての式をスキャンして継続パラメータを収集
  (for-each collect-continuation-params exprs)

  ;; 定義と式を分離
  (define definitions '())
  (define non-definitions '())

  (for ([expr exprs])
    (if (and (list? expr) (eq? (car expr) 'define))
        (set! definitions (append definitions (list expr)))
        (set! non-definitions (append non-definitions (list expr)))))

  (define transformed-defs (map transform-toplevel definitions))
  (define transformed-exprs (map (lambda (e) (cons e (transform-toplevel e))) non-definitions))

  ;; 既にtraceした関数/変数を追跡
  (define already-traced (make-hash))

  ;; 各式とそのtraceを組み立てる
  (define expr-with-traces
    (map (lambda (expr-pair)
           (define original-expr (car expr-pair))
           (define transformed-expr (cdr expr-pair))
           (define called-symbols (extract-called-symbols original-expr))

           ;; まだtraceしていないシンボルを集める
           (define to-trace
             (filter (lambda (sym)
                       (and (not (hash-has-key? already-traced sym))
                            (begin
                              (hash-set! already-traced sym #t)
                              #t)))
                     called-symbols))

           ;; traceとexprのペア
           (if (null? to-trace)
               (format "~s" transformed-expr)
               (string-append
                (format "(trace ~a)\n" (string-join (map symbol->string to-trace) " "))
                (format "~s" transformed-expr))))
         transformed-exprs))

  ;; 出力コードの生成
  (string-append
   "#lang racket\n\n"
   "(require racket/control)\n"
   "(require racket/trace)\n\n"
   "(define key 'key)\n\n"
   "(define (log-push msg)\n"
   "  (displayln (format \"push (~a)\" msg)))\n\n"
   "(define (log-pop msg result)\n"
   "  (displayln (format \"pop (~a) => ~a\" msg result))\n"
   "  result)\n\n\n"
   (string-join (map (lambda (e) (format "~s" e)) transformed-defs) "\n")
   (if (> (length expr-with-traces) 0)
       (string-append "\n" (string-join expr-with-traces "\n"))
       "")
   "\n"))

;; テスト: input.rkt から読み込んで変換
(define (process-file input-file output-file)
  (define input-port (open-input-file input-file))

  ;; #lang racket をスキップ
  (read-line input-port)

  ;; 全ての式を読み込む（requireを含む）
  (define exprs '())
  (let loop ()
    (define expr (read input-port))
    (unless (eof-object? expr)
      (unless (and (list? expr) (eq? (car expr) 'require))
        (set! exprs (append exprs (list expr))))
      (loop)))

  (close-input-port input-port)

  ;; 変換
  (define result (transform-code exprs))

  ;; 出力
  (define output-port (open-output-file output-file #:exists 'replace))
  (display result output-port)
  (close-output-port output-port)

  (displayln (format "変換完了: ~a -> ~a" input-file output-file))

  ;; output.rktを実行してoutput.txtに保存
  (displayln "output.rktを実行中...")
  (define txt-output-file (string-append (substring output-file 0 (- (string-length output-file) 4)) ".txt"))
  (system (format "racket ~a > ~a" output-file txt-output-file))
  (displayln (format "実行結果を保存: ~a" txt-output-file)))

;; 実行
(process-file "src/input.rkt" "src/output.rkt")
