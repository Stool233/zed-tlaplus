(module "MODULE" @context name: (_) @name) @item
(operator_definition name: (_) @name) @item
(function_definition name: (_) @name) @item
(module_definition name: (_) @name) @item
(constant_declaration (identifier) @name) @item
(constant_declaration (operator_declaration name: (_) @name)) @item
(variable_declaration (identifier) @name) @item
(theorem ["THEOREM" "LEMMA" "COROLLARY" "PROPOSITION"] @context name: (_) @name) @item
(assumption ["ASSUME" "ASSUMPTION" "AXIOM"] @context name: (_) @name) @item
(pcal_algorithm (pcal_algorithm_start) @context name: (_) @name) @item
(pcal_process "process" @context name: (_) @name) @item
(pcal_procedure (pcal_proc_decl "procedure" @context name: (_) @name)) @item
(pcal_macro (pcal_macro_decl "macro" @context name: (_) @name)) @item
