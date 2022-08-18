const winston = require('winston');
const { combine, simple, prettyPrint, splat } = winston.format;

const logger = winston.createLogger({
  level: 'debug',
  format: combine(prettyPrint(), splat()),
  transports: [
    new winston.transports.File({
      filename: 'debug.log',
      options: {flags: 'w'},
      /*
      handleExceptions: true,
      handleRejections: true,
      */
      prettyPrint: true,
    }),
  ],
});

const schema = require("./commands.json");

const _ = $ => optional($._ws1);
const decimal_digits = /\d+/;
const signed_integer = seq(optional(choice('-', '+')), decimal_digits);
const exponent_part = seq(choice('e', 'E'), signed_integer);

const decimal_number = choice(
  seq(signed_integer, '.', optional(decimal_digits)),
  seq('.', decimal_digits),
  seq(signed_integer)
);

function parserRuleRedirect($, rule, parser, props) {
  switch (parser) {
    case "brigadier:string": {
      switch (props.type) {
        case "greedy":
          return $.remaining_string;
        case "phrase":
          return choice(
            $.quoted_string,
            $.literal_string
          );
        case "word":
          return $.word;
        default:
          return rule;
      }
      break;
    }
    case "minecraft:range": {
      switch (props.decimals) {
        case true:
          return $.float_range;
        case false:
          return $.int_range;
        default:
          return rule;
      }
      break;
    }
    case "minecraft:resource": {
      if (props.registry == "minecraft:attribute") {
        return alias(rule, $.attribute);
      } else {
        return rule;
      }
      break;
    }
    default:
      return rule;
  }
}

function fromSchema($, schema, key="", depth=0) {
  if (key == "") {
    let choices = [];
    for (let [key, node] of Object.entries(schema.children)) {
      let rule = fromSchema($, node, key, depth+1);
      choices.push(rule);
    }
    return choice(...choices);
  } else {
    let rule;
    if (schema.type == "literal") {
      rule = alias(key,
        (depth == 1) ? $.command : $.subcommand
      );
    } else {
      rule = $[schema.parser];
      if (rule.constructor == ReferenceError) { // Symbol not found
        logger.warn(rule);
        rule = alias(key, $[key]);
      } else if ("properties" in schema) {
        rule = parserRuleRedirect($, rule, schema.parser, schema.properties);
      }
    }
    
    if ("children" in schema) {
      let choice_rule;
      if (depth == 1) {
        choice_rule = $[`${key}_cmd`];
      } else {
        let choices = [];
        for (let [key, node] of Object.entries(schema.children)) {
          choices.push(fromSchema($, node, key, depth+1));
        }
        choice_rule = choice(...choices);
      }
      
      if ("executable" in schema) {
        rule = seq(rule, optional(seq($._ws, optional(choice_rule))));
      } else {
        rule = seq(rule, $._ws, choice_rule);
      }
    } else {
      if ("redirect" in schema) {
        if ("executable" in schema) {
          rule = seq(rule, optional(seq($._ws, optional($[`${schema.redirect[0]}_cmd`]))));
        } else {
          rule = seq(rule, $._ws, $[`${schema.redirect[0]}_cmd`]);
        }
      } else {
        if (!("executable" in schema)) {
          rule = seq(rule, $._ws, $.cmd_line);
        }
      }
    }
    
    return rule;
  }
}



let rules = {
  file: $ => seq(repeat(seq(optional($._line), $._nl)), $._line),
  
  _line: $ => seq(
    /[ \t]*/,
    optional(
      choice($._cmd_line, $.comment)
    )
  ),
  
  _cmd_line: $ => seq($.cmd_line, _($)),
  
  cmd_line: $ => fromSchema($, schema),
  
  comment: $ => seq('#', /.*/),
  
  "brigadier:float": $ => $.decimal,
  "brigadier:double": $ => $.decimal,
  "brigadier:integer": $ => $.integer,
  "brigadier:bool": $ => choice($.true, $.false),
  "brigadier:string": $ => blank(),
  
  "minecraft:angle": $ => axis($.decimal, local=false),
  
  "minecraft:block": $ => $.block,
  
  block: $ => seq(
    field("block", $.resource_location),
    optional(field("states", $.block_states)),
    optional(field("nbt", $.snbt_compound))
  ),
  
  block_states: $ => seq(
    '[',
    commaSep($, $.block_state_pair),
    ']'
  ),
  
  block_state_pair: $ => pair($,
    $.literal_string,
    '=',
    $.literal_string
  ),
  
  "minecraft:block_pos": $ => seq(
    field('x', $.float_axis), $._ws,
    field('y', $.float_axis), $._ws,
    field('z', $.float_axis)
  ),
  
  "minecraft:block_predicate": $ => tag($.block),
  
  "minecraft:block_state": $ => $.block,
  
  "minecraft:color": $ => choice(
    $.color, "reset"),
  
  color: $ => choice(
    "aqua", "black", "blue",
    "dark_aqua", "dark_blue",
    "dark_green", "dark_gray",
    "dark_purple", "dark_red",
    "gold", "green", "gray",
    "light_purple", "red",
    "white", "yellow"
  ),
  
  "minecraft:column_pos": $ => seq(
    field('x', $.int_axis), $._ws,
    field('y', $.int_axis)
  ),
  
  "minecraft:component": $ => $.component,
  
  "minecraft:dimension": $ => $.resource_location,
  
  "minecraft:entity": $ => $.entity,
  
  entity: $ => choice(
    $.entity_variable,
    $.uuid,
    $.player_name
  ),
  
  entity_variable: $ => seq(
    $.entity_var_type,
    optional($.entity_argument)
  ),
  
  entity_var_type: $ => seq(
    '@',
    choice('a', 'e', 'p', 'r', 's')
  ),
  
  entity_argument: $ => seq(
    '[',
    commaSep($, $.entity_argument_pair),
    ']'
  ),
  
  entity_argument_pair: $ => choice(
    entity_var_pair($,
      choice('x', 'y', 'z', "dx", "dy", "dz"),
      '=',
      $.decimal
    ),
    entity_var_pair($,
      choice("distance", "x_rotation", "y_rotation"),
      '=',
      $.float_range
    ),
    entity_var_pair($, "limit", '=', $.integer),
    entity_var_pair($, "level", '=', $.int_range),
    entity_var_pair($,
      "predicate",
      '=',
      neg($.resource_location)
    ),
    entity_var_pair($,
      "sort",
      '=',
      choice("nearest", "furthest",
        "random", "arbitrary")
    ),
    entity_var_pair($,
      "gamemode",
      '=',
      neg(choice("adventure", "creative",
        "spectator", "survival"))
    ),
    entity_var_pair($,
      "name",
      '=',
      neg(choice(
          $.quoted_string,
          /[0-9a-zA-Z-_]+/ 
      ))
    ),
    entity_var_pair($,
      "type",
      '=',
      neg(tag($.resource_location))
    ),
    entity_var_pair($, "nbt", '=', neg($.snbt_compound)),
    $._entity_argument_tag_team,
    entity_var_pair($, "scores", '=', $.entity_argument_scores),
    entity_var_pair($, "advancements", '=', $.entity_argument_advancements)
  ),
  
  _entity_argument_tag_team: $ => seq(
      field("key",
        alias(
          choice("tag", "team"),
          $.entity_var_key
        )
      ),
      _($),
      '=',
      optional(
        seq(
          _($),
          field("value", choice(
            '!',
            neg($.literal_string)
          ))
        )
      )
    ),
  
  //tag_team_name: $ => /[0-9a-zA-Z-_.+]+/,
  
  entity_argument_scores: $ => seq(
    '{', commaSep($, pair($,
      $.key,
      '=',
      $.int_range
    )),
  '}'),
  
  entity_argument_advancements: $ => seq(
    '{', commaSep($, pair($,
      $.key,
      '=',
      choice(
        $.true,
        $.false,
        seq('{', commaSep($, pair($,
          $.key,
          '=',
          choice($.true, $.false))),
        '}')
      )
    )),
  '}'),
  
  player_name: $ => /[0-9a-zA-Z-_.#%$§]+/,
  
  "minecraft:entity_anchor": $ => choice("eyes", "feet"),
  
  "minecraft:entity_summon": $ => $.resource_location,
    
  "minecraft:float_range": $ => $.float_range,
  
  float_range: $ => choice(
    $._float_range,
    alias(
      choice(
        $.non_int_decimal,
        $.trailing_dot_decimal,
        $.integer
      ),
      $.decimal
    )
  ),
  
  _float_range: $ => prec(1, choice(
    seq(
      "..",
      $.decimal
    ),
    seq(
      choice(
        // The parser is always lexing "3.." as "3." and ".", which causes error
        //$.integer,
        alias($.non_int_decimal, $.decimal)
      ),
      "..",
      optional($.decimal)
    ),
    seq(
      // Partial workaround
      alias($.trailing_dot_decimal, $.decimal),
      '.',
      optional($.decimal)
    )
  )),
  
  non_int_decimal: $ => token(choice(
    seq(signed_integer, '.', decimal_digits),
    seq('.', decimal_digits)
  )),
  
  trailing_dot_decimal: $ => token(prec(-1,
    seq(signed_integer, '.')
  )),
  
  "minecraft:function": $ => $.function,
  
  function: $ => tag($.resource_location),
  
  "minecraft:game_profile": $ => $.entity,
  
  "minecraft:int_range": $ => $.int_range,
  
  int_range: $ => range($.integer),
  
  "minecraft:item": $ => $.item,
  
  item: $ => seq(
    field("item", $.resource_location),
    optional(field("nbt", $.snbt_compound))
  ),
  
  "minecraft:item_enchantment": $ => $.resource_location,
  
  "minecraft:item_predicate": $ => tag($.item),
  
  "minecraft:item_slot": $ => choice(
    $.integer,
    "armor.chest", "armor.feet",
    "armor.head", "armor.legs", "weapon.mainhand",
    "weapon.offhand", "weapon",
    seq("container.", $.integer),
    seq("enderchest.", $.integer),
    seq("hotbar.", $.integer),
    seq("inventory.", $.integer),
    "horse.saddle","horse.chest", "horse.armor",
    seq("horse.", $.integer),
    seq("villager.", $.integer)
  ),
  
  "minecraft:item_stack": $ => $.item,
  
  "minecraft:message": $ => $.remaining_string,
  
  "minecraft:mob_effect": $ => $.resource_location,
  
  "minecraft:nbt": $ => $.snbt_compound,
  
  "minecraft:nbt_compound_tag": $ => $.snbt_compound,
  
  "minecraft:nbt_path": $ => $.nbt_path,
  
  nbt_path: $ => seq(
    $._nbt_path_first_group,
    repeat(seq(
      '.',
      $._nbt_path_group
      ))
  ),
  
  _nbt_path_first_group: $ => prec.left(seq(
    $._nbt_path_first_step,
    repeat(
      seq(
        optional('.'),
        $.nbt_path_index
      )
    )
  )),
  
  _nbt_path_first_step: $ => choice(
    $.nbt_path_key,
    $.snbt_compound
  ),
  
  _nbt_path_group: $ => prec.left(seq(
    $._nbt_path_step,
    repeat(
      seq(
        optional('.'),
        $.nbt_path_index
      )
    )
  )),
  
  _nbt_path_step: $ => choice(
    $.nbt_path_key,
    $.nbt_path_index
  ),
  
  nbt_path_index: $ => seq(
    '[', _($),
    optional(
      choice(
        $.snbt_compound,
        $.integer
      )
    ),
    _($), ']'
  ),
  
  nbt_path_key: $ => seq(
    $._nbt_path_key,
    optional($.snbt_compound)
  ),
  
  _nbt_path_key: $ => choice(
    $.quoted_string,
    alias(
      /[0-9a-zA-Z-_+]+/,
      $.literal_string
    )
  ),
  
  "minecraft:nbt_tag": $ => $._snbt_value,
  
  "minecraft:objective": $ => $.objective,
  
  objective: $ => /[0-9a-zA-Z-+_.]+/,
  
  "minecraft:objective_criteria": $ => /[0-9a-zA-Z-_.:]+/,
  
  "minecraft:operation": $ => $.operation,
  
  operation: $ => choice(
    '=', '<', '>', "><", "+=", "-=",
    "*=", "/=", "%="),
  
  "minecraft:particle": $ => choice(
    $.resource_location,
    seq(
      builtin_id($, [
        "block",
        "block_marker",
        "falling_dust"
      ]),
      $._ws,
      $.resource_location,
      optional($.block_states)
    ),
    seq(
      builtin_id($, "dust"), $._ws,
      $.decimal, $._ws,
      $.decimal, $._ws,
      $.decimal, $._ws,
      $.decimal
    ),
    seq(
      builtin_id($, "dust_color_transition"), $._ws,
      $.decimal, $._ws,
      $.decimal, $._ws,
      $.decimal, $._ws,
      $.decimal, $._ws,
      $.decimal, $._ws,
      $.decimal, $._ws,
      $.decimal
    ),
    seq(
      builtin_id($, "item"), $._ws,
      $.item
    ),
    seq(
      builtin_id($, "sculk_charge"), $._ws,
      $.decimal
    ),
    seq(
      builtin_id($, "shriek"), $._ws,
      $.integer
    ),
    seq(
      builtin_id($, "vibration"), $._ws,
      $.vec3, $._ws,
      $.decimal
    )
  ),
  
  "minecraft:range": $ => blank(),
  
  "minecraft:resource": $ => $.resource_location,
  "minecraft:resource_location": $ => $.resource_location,
  "minecraft:resource_or_tag": $ => tag($.resource_location),
  
  "minecraft:rotation": $ => seq(
    field("pitch", $.rot_axis), $._ws,
    field("yaw", $.rot_axis)
  ),
  
  "minecraft:score_holder": $ => choice(
    '*', $.entity),
  
  "minecraft:scoreboard_slot": $ => choice(
    "list", "sidebar", "belowName",
    seq("sidebar.team.", $.color)
  ),
  
  "minecraft:swizzle": $ => choice(
   /xy?z?/, /yz?x?/, /zx?y?/,
   "xzy", "yxz", "zyx"
  ),
  
  "minecraft:team": $ => $.literal_string,
  
  "minecraft:template_mirror": $ => choice(
    "none", "front_back", "left_right"
  ),
  
  "minecraft:template_rotation": $ => choice(
    "none", "clockwise_90",
    "counterclockwise_90", "180"
  ),
  
  "minecraft:time": $ => seq(
    field("time", $.integer),
    optional(
      field("unit", $.time_unit)
  )),
  
  time_unit: $ => choice('d', 's', 't'),
  
  "minecraft:uuid": $ => $.uuid,
  
  uuid: $ => /[0-9a-fA-F]{1,8}-[0-9a-fA-F]{1,4}-[0-9a-fA-F]{1,4}-[0-9a-fA-F]{1,4}-[0-9a-fA-F]{1,12}/,
  
  "minecraft:vec2": $ => seq(
    field('x', $.float_axis), $._ws,
    field('y', $.float_axis)
  ),
  
  "minecraft:vec3": $ => $.vec3,
  
  vec3: $ => seq(
    field('x', $.float_axis), $._ws,
    field('y', $.float_axis), $._ws,
    field('z', $.float_axis)
  ),

  resource_location: $ => choice(
    field("id", alias($.namespace, $.id)),
    field("id", $.id),
    seq(
      optional(field("namespace", $.namespace)),
      ':',
      optional(field("id", $.id))
    )
  ),
    
  namespace: $ => choice(
    $._ns_minecraft,
    /[0-9a-z-_\\.]+/
  ),
  
  _ns_minecraft: $ => "minecraft",
  
  id: $ => /[0-9a-z-_\\\/.]+/,

  snbt_compound: $ => seq(
    "{", commaSep($, $.snbt_pair), "}"
  ),

  snbt_pair: $ => pair($,
    $._snbt_string,
    ":",
    $._snbt_value
  ),

  _snbt_value: $ => choice(
    $.snbt_compound,
    $.snbt_array,
    $.snbt_list,
    $.snbt_number,
    $.snbt_true,
    $.snbt_false,
    $._snbt_string
  ),

  snbt_list: $ => seq(
    "[", commaSep($, $._snbt_value), "]"
  ),
    
  snbt_array: $ => seq(
    "[",
    field("type", $.snbt_array_type),
    ';',
    commaSep($, $.snbt_number),
    "]"
  ),

  snbt_array_type: $ => choice('B', 'I', 'L'),

  snbt_number: $ => token(seq(
    decimal_number,
    optional(/[bBdDfFlLsS]/)
  )),

  _snbt_string: $ => choice(
    $.quoted_string,
    $.literal_string
  ),
  
  snbt_true: $ => "true",
  snbt_false: $ => "false",

  component: $ => $._json_value,

  _json_value: $ => choice(
    $.json_object,
    $.json_array,
    $.json_number,
    $.json_string,
    $.json_true,
    $.json_false,
    $.json_null
  ),

  json_object: $ => seq(
    "{", commaSep($, $.json_pair), "}"
  ),

  json_pair: $ => pair($,
    $.json_string,
    ":",
    $._json_value
  ),

  json_array: $ => seq(
    "[", commaSep($, $._json_value), "]"
  ),

  json_string: $ => $._double_quoted_string,
    
  json_number: $ => {
    const decimal_integer_literal = seq(
      optional('-'),
      choice(
        '0',
        seq(/[1-9]/, optional(decimal_digits))
      )
    );

    return choice(
      seq(decimal_integer_literal, '.', optional(decimal_digits), optional(exponent_part)),
      seq(decimal_integer_literal, optional(exponent_part))
    );
  },

  json_true: $ => "true",

  json_false: $ => "false",

  json_null: $ => "null",
  
  integer: $ => token(signed_integer),

  decimal: $ => token(decimal_number),

  quoted_string: $ => choice(
    $._double_quoted_string,
    $._single_quoted_string
  ),
  
  _double_quoted_string: $ => choice(
    '""',
    seq('"',
      alias($.double_quoted_string_content, $.string_content),
      '"'
    )
  ),

  double_quoted_string_content: $ => repeat1(choice(
    prec(1, /[^\\"\n]+/),
    $.escape_sequence
  )),
  
  _single_quoted_string: $ => choice(
    "''",
    seq("'",
      alias($.single_quoted_string_content, $.string_content),
      "'")
  ),

  single_quoted_string_content: $ => repeat1(choice(
    prec(1, /[^\\'\n]+/),
    $.escape_sequence
  )),

  escape_sequence: $ => seq(
    '\\',
    choice(
      /(\"|\'|\\|\/|b|f|n|r|t)/,
      /u[0-9a-fA-F]{4}/
    )
  ),

  literal_string: $ => prec(-1, /[a-zA-Z0-9-_.+]+/),
    
  remaining_string: $ => /.+/,
  
  word: $ => /[^\s]+/,
  
  key: $ => /[0-9a-zA-Z-_.:\/+]+/,
  
  rot_axis: $ => axis($.decimal, local=false),
  float_axis: $ => axis($.decimal),
  int_axis: $ => axis($.integer),

  true: $ => "true",
  false: $ => "false",
   
  _ws1: $ => /[ \t]+/,
  _ws: $ => ' ',
  _nl: $ => /\r?\n/,
};

function addRules(rules, schema, key="", depth=0) {
  if (key == "") {
    for (let [sub_key, node] of Object.entries(schema.children)) {
      addRules(rules, node, sub_key, depth+1);
    }
  } else {
    if ("children" in schema) {
      rules[`${key}_cmd`] = $ => {
        let choices = [];
        for (let [sub_key, node] of Object.entries(schema.children)) {
          choices.push(fromSchema($, node, sub_key, depth+1));
        }
        return choice(...choices);
      };
    }
  }
}

addRules(rules, schema);

add_builtin_id(rules, [
  "block",
  "block_marker",
  "falling_dust"
]);
add_builtin_id(rules, "dust");
add_builtin_id(rules, "dust_color_transition");
add_builtin_id(rules, "item");
add_builtin_id(rules, "sculk_charge");
add_builtin_id(rules, "shriek");
add_builtin_id(rules, "vibration");

logger.debug(rules);

module.exports = grammar({
  name: 'mcfunction',
  
  extras: $ => [],
  
  conflicts: $ => [
    [$._entity_argument_tag_team],
    [
      $.namespace, $._crl_block,
      $._crl_dust, $._crl_dust_color_transition,
      $._crl_item, $._crl_sculk_charge,
      $._crl_shriek, $._crl_vibration
    ]
  ],
  
  rules: rules,
});

function sep1($, rule, separator) {
  return seq(_($), rule, _($), repeat(seq(separator, _($), rule, _($))));
}

function sepTrailing($, rule, separator) {
  return seq(sep1($, rule, separator), _($), optional(separator));
}

function sep($, rule, separator) {
  return optional(sepTrailing($, rule, separator));
}

function commaSep($, rule) {
  return sep($, rule, ',');
}

function pair($, key, p_sep, value) {
  return seq(
    field("key", key),
    _($),
    p_sep,
    _($),
    field("value", value)
  );
}

function entity_var_pair($, key, p_sep, value) {
  return pair($, alias(key, $.entity_var_key), p_sep, value);
}

function tag(rule) {
  return seq(optional('#'), rule);
}

function neg(rule) {
  return seq(optional('!'), rule);
}

function range(rule) {
  return choice(
    rule,
    seq(
      field("min", rule),
      "..",
      optional(field("max", rule))
    ),
    seq(
      "..",
      field("max", rule)
    )
  );
}

function axis(number, local=true) {
  let prefixes = (local) ? choice("~", "^") : "~";
  return choice(
      number,
      seq(
        prefixes,
        optional(number)
      )
    );
}

function builtin_id($, id) {
  let id_string = Array.isArray(id) ? id[0] : id;
  // crl = constant resouce location
  return alias($[`_crl_${id_string}`], $.resource_location);
}

function add_builtin_id(rules, id) {
  let id_string = Array.isArray(id) ? id[0] : id;
  
  rules[`_crl_${id_string}`] = $ => seq(
    optional(
      seq(
        optional(
          field(
            "namespace",
            alias($._ns_minecraft, $.namespace)
          )
        ),
        ':'
      )
    ),
    field("id", alias(Array.isArray(id) ? choice(...id) : id, $.id))
  );
}