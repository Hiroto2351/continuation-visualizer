#lang racket

(require racket/control)

(+ 1 (reset (+ 10 (shift k (k 100)))))