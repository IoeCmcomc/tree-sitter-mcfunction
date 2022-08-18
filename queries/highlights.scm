(function
  (resource_location) @function)

(
  ("#") @tag
  (resource_location) @tag
)

[
  (snbt_array_type)
  (time_unit)
] @type.builtin

[
  (key)
  (entity_var_key)
] @string.special

(block_state_pair
  key: (literal_string) @string.special)

(snbt_pair
  key: (_) @string.special)

(json_pair
  key: (json_string) @string.special)

(attribute
  (resource_location) @attribute)

(resource_location) @constant

(command) @keyword

(comment) @comment

(objective) @variable

(escape_sequence) @escape

[
  (true)
  (false)
  (snbt_true)
  (snbt_false)
  (json_true)
  (json_false)
  (json_null)
] @constant.builtin

[
  (integer)
  (decimal)
  (snbt_number)
  (json_number)
] @number

[
  (quoted_string)
  (literal_string)
  (json_string)
  (remaining_string)
  (word)
] @string

[
  "["
  "]"
  "{"
  "}"
] @punctuation.bracket

[
 ","
 ":"
 ";"
 "="
 "."
 ".."
] @punctuation.delimiter

(entity_var_type) @variable.builtin

(operation) @operator

(subcommand) @module