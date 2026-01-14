'use client';

import './CodeEditor.css';
import { useState } from 'react';

interface CodeEditorProps {
  initialValue?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  onExecute?: (output: string) => void;
}

function CodeEditor({ 
  initialValue = '', 
  onChange,
  placeholder = 'コードを入力してください...',
  onExecute
}: CodeEditorProps) {
  const [code, setCode] = useState(initialValue);
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState<string>('');

  // テストコード集
  const testCodes = [
    {
      name: 'call/cc - 基本',
      code: '(+ 1 (call/cc (lambda (k) (+ 10 (k 100)))))'
    },
    {
      name: 'call/cc - ネスト',
      code: '(+ 1 (call/cc (lambda (k1) (+ 10 (call/cc (lambda (k2) (+ 100 (k1 1000))))))))'
    },
    {
      name: 'call/cc - 関数',
      code: `(define cont #f)

(define (h n)
  (call/cc (lambda (k) (set! cont k) n))
  )

(define (g n)
  (+ 2 (h n))
  )

(define (f n)
  (+ (g n) 3)
  )

(f 3)
(cont 5)`
    },
    {
      name: 'shift/reset - 基本',
      code: '(+ 1 (reset (+ 10 (shift k (k 100)))))'
    },
    {
      name: 'shift/reset - ネスト',
      code: '(reset (+ 1 (shift k1 (+ 2 (shift k2 (k1 (k2 3)))))))'
    },
    {
      name: 'shift/reset - 複数reset',
      code: '(reset (+ 1 (reset (+ 10 (shift k (k 100))))))'
    },
    {
      name: 'shift/reset - 関数',
      code: `(define cont #f)

(define (h n)
  (shift k (set! cont k) (k n)))

(define (g n)
  ( + 2 (h n)))

(define (f n)
  (reset (+ (g n) 3)))

(f 3)
(cont 5)`
    },
    {
      name: '四則演算',
      code: '(/ (+ (* 2 3) 4) 5)'
    }
  ];

  const handleTestCodeSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedCode = e.target.value;
    if (selectedCode) {
      setCode(selectedCode);
      onChange?.(selectedCode);
    }
    // 選択後はデフォルトに戻す
    e.target.value = '';
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setCode(newValue);
    onChange?.(newValue);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const target = e.target as HTMLTextAreaElement;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const newValue = code.substring(0, start) + '  ' + code.substring(end);
      setCode(newValue);
      
      // カーソル位置を調整
      setTimeout(() => {
        target.selectionStart = target.selectionEnd = start + 2;
      }, 0);
      
      onChange?.(newValue);
    }
  };

  const handleExecute = async () => {
    if (!code.trim()) return;
    
    setIsExecuting(true);
    setError(null);
    
    try {
      const response = await fetch('/api/execute-racket', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || '実行エラー');
      }
      
      setOutput(data.output);
      onExecute?.(data.output);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '不明なエラー';
      setError(errorMessage);
      console.error('Racket実行エラー:', err);
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div id="editor">
      <div className="editor-toolbar">
        <select 
          onChange={handleTestCodeSelect}
          className="test-code-select"
          defaultValue=""
        >
          <option value="" disabled>テストコードを選択</option>
          {testCodes.map((test, index) => (
            <option key={index} value={test.code}>
              {test.name}
            </option>
          ))}
        </select>
        <button
          onClick={handleExecute}
          disabled={!code.trim() || isExecuting}
          className="execute-button"
        >
          {isExecuting ? '実行中...' : 'コードを実行'}
        </button>
        {error && <div className="error-message">{error}</div>}
      </div>
      <textarea
        value={code}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        spellCheck={false}
      />
      <div className="output-section">
        <div className="output-header">出力</div>
        <pre className="output-content">{output || '実行結果がここに表示されます'}</pre>
      </div>
    </div>
  );
}

export default CodeEditor;