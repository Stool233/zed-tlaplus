; Generic names first; context-specific captures below take precedence in Zed.
(identifier) @variable
(identifier_ref) @variable

[
  "ACTION" "ASSUME" "ASSUMPTION" "AXIOM" "BY" "CASE" "CHOOSE"
  "CONSTANT" "CONSTANTS" "COROLLARY" "DEF" "DEFINE" "DEFS" "ELSE"
  "EXCEPT" "EXTENDS" "HAVE" "HIDE" "IF" "IN" "INSTANCE" "LAMBDA"
  "LEMMA" "LET" "LOCAL" "MODULE" "NEW" "OBVIOUS" "OMITTED" "ONLY"
  "OTHER" "PICK" "PROOF" "PROPOSITION" "PROVE" "QED" "RECURSIVE"
  "SF_" "STATE" "SUFFICES" "TAKE" "TEMPORAL" "THEN" "THEOREM"
  "USE" "VARIABLE" "VARIABLES" "WF_" "WITH" "WITNESS"
] @keyword

[
  "algorithm" "assert" "await" "begin" "call" "define" "do" "either"
  "else" "elsif" "end" "fair" "goto" "if" "macro" "or" "print"
  "procedure" "process" "then" "variable" "variables" "when" "while" "with"
  (pcal_algorithm_start) (pcal_end_either) (pcal_end_if)
  (pcal_end_while) (pcal_end_with) (pcal_return) (pcal_skip)
] @keyword

[
  (prefix_op_symbol) (infix_op_symbol) (postfix_op_symbol)
  (def_eq) (assign) (gets) (all_map_to) (maps_to) (set_in)
  (forall) (exists) (temporal_forall) (temporal_exists)
  (case_arrow) (case_box) (bullet_conj) (bullet_disj)
  (address) (prev_func_val) (label_as)
] @operator
(bound_prefix_op symbol: (_) @operator)
(bound_infix_op symbol: (_) @operator)
(bound_postfix_op symbol: (_) @operator)
(bound_nonfix_op symbol: (_) @operator)

[(nat_number) (real_number) (binary_number) (octal_number) (hex_number)] @number
(boolean) @boolean
[(boolean_set) (string_set) (nat_number_set) (int_number_set) (real_number_set)] @type
(string) @string
(escape_char) @string.escape

(module name: (_) @type)
(extends (identifier_ref) @type)
(instance (identifier_ref) @type)
(module_definition name: (_) @type)
(constant_declaration (identifier) @constant)
(constant_declaration (operator_declaration name: (_) @constant))
(variable_declaration (identifier) @variable)
(operator_definition name: (_) @function)
(function_definition name: (_) @function)
(bound_op name: (_) @function)
(operator_definition parameter: (identifier) @variable.parameter)
(operator_definition parameter: (operator_declaration name: (_) @variable.parameter))
(module_definition parameter: (identifier) @variable.parameter)
(quantifier_bound (identifier) @variable.parameter)
(quantifier_bound (tuple_of_identifiers (identifier) @variable.parameter))
(unbounded_quantification (identifier) @variable.parameter)
(choose (identifier) @variable.parameter)
(lambda (identifier) @variable.parameter)
(record_literal (identifier) @property)
(set_of_records (identifier) @property)
(record_value "." (identifier_ref) @property)
(except_update_record_field (identifier_ref) @property)
(theorem name: (identifier) @function)
(assumption name: (identifier) @constant)
[(proof_step_id) (proof_step_ref)] @label
(label name: (_) @label)

(pcal_algorithm name: (identifier) @type)
(pcal_macro_decl name: (identifier) @function)
(pcal_macro_decl parameter: (identifier) @variable.parameter)
(pcal_macro_call name: (identifier) @function)
(pcal_proc_decl name: (identifier) @function)
(pcal_proc_call name: (identifier) @function)
(pcal_process name: (identifier) @function)
(pcal_var_decl (identifier) @variable)
(pcal_proc_var_decl (identifier) @variable.parameter)
(_ label: (identifier) @label)
(pcal_goto statement: (identifier) @label)

["(" ")" "[" "]" "]_" "{" "}" (langle_bracket) (rangle_bracket) (rangle_bracket_sub)] @punctuation.bracket
["," ":" "." "!" ";" (placeholder)] @punctuation.delimiter
[(header_line) (double_line) (single_line)] @punctuation.special

; Do not capture the whole block_comment: it can contain a PlusCal algorithm.
(comment) @comment
(block_comment "(*" @comment "*)" @comment)
(block_comment_text) @comment
(extramodular_text) @comment
