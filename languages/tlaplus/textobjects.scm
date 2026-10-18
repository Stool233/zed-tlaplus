(module) @class.around
(operator_definition definition: (_) @function.inside) @function.around
(function_definition definition: (_) @function.inside) @function.around
(theorem statement: (_) @function.inside) @function.around
(pcal_algorithm) @class.around
(pcal_procedure (pcal_algorithm_body) @function.inside) @function.around
(pcal_macro (pcal_algorithm_body) @function.inside) @function.around
(pcal_process (pcal_algorithm_body) @function.inside) @function.around
(comment)+ @comment.around
(block_comment) @comment.around
