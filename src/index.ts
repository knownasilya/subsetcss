'use strict';

import stylelint from 'stylelint';
import valueParser from 'postcss-value-parser';

const subsetMap: SubsetMap = {
  'border': ['border-width', 'border-style', 'border-color'],
  'margin': ['margin-top', 'margin-right', 'margin-bottom', 'margin-left'],
  'background': []
};

export const ruleName = 'design-system/config';
export const messages =  stylelint.utils.ruleMessages(ruleName, {
  invalid(prop, actual, subset, pieceProp) {
    let thing = pieceProp ? `The ${pieceProp}` : 'It';
    return `Invalid \`${prop}: ${actual}\`. ${thing} should use one of the following values: ${subset.join(', ')}.`
  }
});

export default stylelint.createPlugin(ruleName, function(configPath) {
  const config = require(configPath);

  return function(postcssRoot, postcssResult) {
    let validOptions = stylelint.utils.validateOptions(postcssResult, ruleName);
    if (!validOptions) {
      return;
    };
    let processed = [];

    postcssRoot.walkDecls(decl => {
      let subset = config.subsets[decl.prop];
      processed.push(decl);

      // Try alternates, maybe this rule is made up of multiple rules, like `border`.
      if (!subset) {
        let alternates = subsetMap[decl.prop];
        
        if (alternates) {
          let parsed = valueParser(decl.value);
          let values: string[] = [];

          parsed.walk((item: ValueParserNode) => {
            if (item.type === 'word') {
              values.push(item.value);
            }
          });

          alternates.forEach((alt, index) => {
            let subset = config.subsets[alt];
            let value = values[index];
            
            checkValueAgainstSubset(decl, value, subset, postcssResult, alt);
          });
        }
        
        return;
      }

      checkAgainstSubset(decl, subset, postcssResult);
    });

    postcssRoot.walkAtRules(rule => {
      if (rule.type === 'atrule') {
        let name = `@${rule.name}`;
        let atConfig = config.subsets[name];
        let { nodes } = valueParser(rule.params);
        
        if (nodes.length) {
          let words: string[] = [];
          nodes[0].nodes.forEach((node: ValueParserNode) => {
            if (node.type === 'word') {
              words.push(node.value);
            }
          });

          if (words.length === 2) {
            let [prop, value] = words;
            let subset = atConfig.params[prop];
            let decl = {
              prop,
              value,
              ...rule
            };
            checkValueAgainstSubset(decl, value, subset, postcssResult);
          }
        }

        rule.walkDecls(decl => {
          let subset = atConfig.subsets[decl.prop] || config.subsets[decl.prop];

          // Try alternates, maybe this rule is made up of multiple rules, like `border`.
          if (!subset) {
            let alternates = subsetMap[decl.prop];
            
            if (alternates) {
              let parsed = valueParser(decl.value);
              let values: string[] = [];

              parsed.walk((item: ValueParserNode) => {
                if (item.type === 'word') {
                  values.push(item.value);
                }
              });

              alternates.forEach((alt, index) => {
                let subset = config.subsets[alt];
                let value = values[index];
                
                checkValueAgainstSubset(decl, value, subset, postcssResult, alt);
              });
            }
            
            return;
          }

          checkAgainstSubset(decl, subset, postcssResult);
        });
      }
    });

  }
});

function checkAgainstSubset(decl, subset, postcssResult) {
  return checkValueAgainstSubset(decl, decl.value, subset, postcssResult);
}

function checkValueAgainstSubset(decl, value, subset, postcssResult, altProp?: string) {
  if (Array.isArray(subset)) {
    let valueNotInSubset = !subset.includes(value);
    if (valueNotInSubset) {
      stylelint.utils.report({
        ruleName: ruleName,
        result: postcssResult,
        node: decl,
        message: messages.invalid(decl.prop, decl.value, subset, altProp)
      });
    }
  }
}

interface SubsetMap {
  [type: string]: string[]
}
interface ValueParserNode {
  type: string;
  value: string;
}