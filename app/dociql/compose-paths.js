"use strict";
const generateExample = require("./generate-example")
const convertTypeToSchema = require("./convert-type")
const {
    GraphQLObjectType} = require("graphql")


module.exports = function (domains, graphQLSchema) {    
    
    function composePath(tag, usecase) {
        const result = {}

        const operationId = usecase.name.replace(/ /g, '_').toLowerCase();

        const queryTokens = usecase.query.split(".");
        if (queryTokens.length < 2)
            throw new TypeError(`Domain: ${tag}. Usecase query '${usecase.query}' is not well formed.\nExpected 'query.<fieldName>' or 'mutation.<mutationName>'`)
        const typeDict = queryTokens[0] == "query" ?
            graphQLSchema.getQueryType() :
            graphQLSchema.getMutationType()

        var target = typeDict;        
        var targetTree = []        
        queryTokens.forEach((token, i) => {
            
            if (i == 0) return;

            if (target instanceof GraphQLObjectType) {
                target =target.getFields()[token]
            } else {
                target =target.type.getFields()[token]
            }            
            targetTree.push(target)
        });        
        var expandFields = []
        if (usecase.expand) {
            expandFields = (usecase.expand.match(/\w+\([\w, ]+\)/gm) || [usecase.expand]).map(match =>  {
                const expandIndex = match.indexOf("(")
                return {
                    field: match.substring(0, expandIndex).trim(),
                    select: match.substring(expandIndex+1, match.indexOf(")"))    
                }
            }) 
            expandFields = expandFields.concat(usecase.expand.match(/(?![^\(]*\))\w+/g).map(match => ({
                field: match,
                select: null
            })))            
        }

        const selectFields = usecase.select ? usecase.select.split(" ") : null; // null = select all                
        expandFields.push({
            field: target.name,
            select: selectFields
        })

        var examples = generateExample(queryTokens[0].toLowerCase(), target, expandFields, targetTree)

        const responseSchema = convertTypeToSchema(target.type);
        responseSchema.example = examples.schema;

        var args = examples.args ? examples.args.map(_ => ({
            name: _.name,
            description: _.description,
            in: "query",
            schema: convertTypeToSchema(_.type)
        })) : [];

        const bodyArg = { in: "body",
            example: examples.query,
            schema: args.length == 0 ?
                null :
                {
                    type: "object",
                    properties: args.reduce((cur, next) => {
                        cur[next.name] = Object.assign({}, next.schema)     
                        return cur;                   
                    }, {})
                }
        }

        args.push(bodyArg);

        result[operationId] = {
            post: {
                tags: [tag],
                summary: usecase.name,
                description: usecase.description,
                operationId: operationId,
                consumes: ["application/json"],
                produces: ["application/json"],
                parameters: args,
                responses: {
                    '200': {
                        description: "Successful operation",
                        schema: responseSchema
                    },
                }
            }
        }

        return result;
    }

    const paths = {}

    domains.forEach(domain => {
        domain.usecases.forEach(u => Object.assign(paths, composePath(domain.name, u)));
    });

    return paths
}