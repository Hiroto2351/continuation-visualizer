#lang racket

(require racket/control)
(require racket/trace)

(define key 'key)

(define (log-push msg)
  (displayln (format "push (~a)" msg)))

(define (log-pop msg result)
  (displayln (format "pop (~a) => ~a" msg result))
  result)



(with-continuation-mark key "+ 1" (begin (log-push "+ 1") (log-pop "+ 1" (+ 1 (with-continuation-mark key "reset" (begin (log-push "reset") (let ((marks (continuation-mark-set->list (current-continuation-marks) key))) (displayln (format "reset: ~a" marks)) (log-pop "reset" (reset (with-continuation-mark key "+ 10" (begin (log-push "+ 10") (log-pop "+ 10" (+ 10 (with-continuation-mark key "shift k" (begin (log-push "shift k") (let ((marks (continuation-mark-set->list (current-continuation-marks) key))) (displayln (format "shift: ~a ~a" (quote k) marks)) (log-pop "shift k" (shift k (let ((k-marks marks)) (with-continuation-mark key "k 100" (begin (log-push "k 100") (trace k) (let* ((val 100) (val-display (if (procedure? val) "100" val))) (displayln (format "call: ~a (value:~a,marks:~a)" (quote k) val-display k-marks)) (log-pop "k 100" (k val))))))))))))))))))))))))
