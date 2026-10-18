; Keep module bodies at column zero. Only expressions and algorithm blocks indent.
(operator_definition (def_eq) @start) @indent
(function_definition (def_eq) @start) @indent
(let_in "LET" @start "IN" @end) @indent
(parentheses "(" @start ")" @end) @indent
(tuple_literal (langle_bracket) @start (rangle_bracket) @end) @indent
(finite_set_literal "{" @start "}" @end) @indent
(record_literal "[" @start "]" @end) @indent
(function_literal "[" @start "]" @end) @indent
(except "[" @start "]" @end) @indent
(pcal_algorithm_body) @indent
(pcal_if) @indent
(pcal_while) @indent
(pcal_either) @indent
(pcal_with) @indent
[(pcal_end_if) (pcal_end_while) (pcal_end_either) (pcal_end_with)] @outdent
