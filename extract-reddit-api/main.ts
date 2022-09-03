#!/usr/bin/env -S deno run --allow-net=www.reddit.com

import { DOMParser, HTMLElement } from "https://esm.sh/linkedom@0.14.12/cached";
import { OpenAPIV3 } from "https://esm.sh/openapi-types@12.0.2";
import { NodeStruct } from "https://esm.sh/v92/linkedom@0.14.12/types/mixin/parent-node.d.ts";
import './dom-inspection.ts'; // for debugging

import { stringify as stringifyYaml } from "https://deno.land/std@0.154.0/encoding/yaml.ts";

// Build an object with the OAuth scopes from reddit's public API
const scopes = await fetch('https://www.reddit.com/api/v1/scopes')
  .then(x => x.json()) as Record<string, {
    id: string;
    name: string;
    description: string;
  }>;
const scopeMap = Object
  .fromEntries(Object
    .values(scopes)
    .map(x => [x.id, x.description]));

// Start an OAuth document with description of auth flows
const api: OpenAPIV3.Document = {
  openapi: '3.0.2',
  info: {
    title: 'Reddit API',
    version: 'TODO',
    description: `An OpenAPIv3 schema for Reddit's public API endpoints, automatically generated from Reddit's automatically generated API documentation.`,
    contact: {
      url: 'https://github.com/danopia/various-openapi-schemas',
    },
  },
  servers: [{
    url: 'https://oauth.reddit.com',
    description: 'Accepts authenticated requests that contain a bearer token.',
  }, {
    url: 'https://www.reddit.com',
    description: 'Accepts authentication flow (and anonymous) requests.',
  }],
  components: {
    securitySchemes: {
      redditOAuth: {
        type: 'oauth2',
        description: 'https://github.com/reddit-archive/reddit/wiki/OAuth2',
        flows: {
          authorizationCode: {
            authorizationUrl: 'https://www.reddit.com/api/v1/authorize',
            tokenUrl: 'https://www.reddit.com/api/v1/access_token',
            scopes: scopeMap,
          },
          implicit: {
            authorizationUrl: 'https://www.reddit.com/api/v1/authorize',
            scopes: scopeMap,
          },
        },
      },
      oauthClientSecret: {
        type: 'http',
        scheme: 'basic',
      },
    },
  },
  tags: [],
  paths: {
    // These endpoints are not in the official API listing, these definitions are from reddit oauth documentation.
    "/api/v1/access_token": {
      post: {
        operationId: "POST_api_v1_access_token",
        summary: `Complete an OAuth flow to receive a bearer token`,
        servers: [{
          url: 'https://www.reddit.com',
          description: 'Accepts authentication requests.',
        }],
        externalDocs: {
          url: 'https://github.com/reddit-archive/reddit/wiki/OAuth2',
        },
        security: [{
          oauthClientSecret: [],
        }],
        requestBody: {
          content: {
            "application/x-www-form-urlencoded": {
              schema: {
                type: 'object',
                required: ['grant_type'],
                properties: {
                  grant_type: { type: 'string', enum: [
                    'authorization_code', // id/secret user app
                    'refresh_token',      // id/secret user app with duration=permanent
                    'client_credentials', // id/secret anonymous app
                    'https://oauth.reddit.com/grants/installed_client', // id-only anonymous app
                    // 'password' is mentioned in docs, but not shown in use
                  ] },
                  code: { type: 'string', description: 'Required for grant_type=authorization_code' },
                  redirect_uri: { type: 'string', description: 'Required for grant_type=authorization_code' },
                  refresh_token: { type: 'string', description: 'Required for grant_type=refresh_token' },
                  device_id: { type: 'string', description: 'Optional for grant_type=.../installed_client' },
                },
              },
            },
          },
        },
        responses: {
          401: {
            description: 'Client credentials sent as HTTP Basic Authorization were invalid',
          },
          200: {
            description: 'Contains an access token for use in future API calls',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    access_token: { type: 'string' },
                    token_type: { type: 'string', enum: ['bearer'] },
                    expires_in: { type: 'integer' },
                    scope: { type: 'string' },
                    refresh_token: { type: 'string' },
                  },
                  required: ['access_token', 'token_type', 'expires_in', 'scope'],
                },
              },
            },
          },
        },
      },
    },
    "/api/v1/revoke_token": {
      post: {
        operationId: "POST_api_v1_revoke_token",
        summary: `Revokes a bearer token so that it cannot be used anymore`,
        servers: [{
          url: 'https://www.reddit.com',
          description: 'Accepts authentication requests.',
        }],
        externalDocs: {
          url: 'https://github.com/reddit-archive/reddit/wiki/OAuth2#manually-revoking-a-token',
        },
        security: [{
          oauthClientSecret: [],
        }],
        requestBody: {
          content: {
            "application/x-www-form-urlencoded": {
              schema: {
                type: 'object',
                required: ['token'],
                properties: {
                  token: { type: 'string' },
                  token_type_hint: { type: 'string', enum: [
                    'access_token',
                    'refresh_token',
                  ] },
                },
              },
            },
          },
        },
        responses: {
          401: {
            description: 'Client credentials sent as HTTP Basic Authorization were invalid',
          },
          204: {
            description: 'It worked',
          },
        },
      },
    },
  },
};


const text = await fetch('https://www.reddit.com/dev/api').then(x => x.text());
// const text = await Deno.readTextFile('reddit-api.html');
const document = new DOMParser().parseFromString(text, 'text/html');

let currentSection = '';
for (const node of document.querySelector('.section.methods').childNodes as NodeStruct[]) {
  if (node.localName == 'h2') {
    currentSection = node.innerText;
    api.tags!.push({
      name: currentSection,
    });
    continue;
  }
  if (node.getAttribute('class') == 'description') {
    api.tags!.find(x => x.name == currentSection)!.description = node.innerText;
    continue;
  }

  console.error(node.querySelector('.links a')?.getAttribute('href'));
  const op: OpenAPIV3.OperationObject = {
    operationId: node.querySelector('.links a').getAttribute('href').slice(1),
    security: [{
      redditOAuth: node.querySelectorAll('.oauth-scope').map(x => x.innerText),
    }],
    description: node.querySelector('.info .md')?.innerText.trimEnd() ?? '',
    tags: [currentSection],
    responses: {
      200: {
        description: 'TODO',
        content: {
          'application/json': {
            // TODO: schema
          },
        },
      },
    },
    parameters: [],
  }

  const method = node.querySelector('.method').innerText.toLowerCase().trimEnd() as "get"|"patch"|"post"|"delete"|"put";

  const paramTable = node.querySelector('table.parameters');
  if (paramTable) {
    for (const row of paramTable.querySelectorAll('tr')) {
      if (row.getAttribute('class').includes('json-model')) {
        op.requestBody = {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {},
                description: row.querySelector('td').innerText.trimEnd() ?? '',
                // TODO
              },
            },
          },
        };
        continue;
      }
      const existingParam = (op.parameters as OpenAPIV3.ParameterObject[]).find(x => x.name == row.querySelector('th').innerText);
      if (existingParam) {
        existingParam.description = row.querySelector('td').innerText.trimEnd() ?? '';

      } else {
        op.parameters?.push({
          name: row.querySelector('th').innerText,
          in: 'query',
          description: row.querySelector('td').innerText.trimEnd() ?? '',
        });
      }
    }
  }

  const altPaths = node.querySelectorAll('.uri-variants li');
  if (altPaths.length > 0) {
    for (const altPath of altPaths) {
      const extraParams = new Array<OpenAPIV3.ParameterObject>();
      const path = stringifyPath(altPath.childNodes.slice(1), extraParams);
      api.paths![path] ??= {};
      api.paths![path]![method] = {
        ...op,
        parameters: [
          ...extraParams,
          ...op.parameters!,
        ],
        operationId: altPath.getAttribute('id'),
      };
    }

  } else {
    const path = stringifyPath(node.querySelector('h3').childNodes.slice(1, -1), op.parameters!);
    api.paths![path] ??= {};
    api.paths![path]![method] = op;
    // console.log({method,path});
    // break;
  }
}

console.log(stringifyYaml({ ...api }));
// console.log(JSON.stringify(api, null, 2))
// for (const path of Object.values(api.paths)) {
//   if (!path) continue;
//   for (const method of Object.values(path)) {
//     if (typeof method == 'string') continue;
//     console.log(Deno.inspect(method, {depth: 10}));
//     console.log(stringifyYaml({ ...method }));
//   }
// }
// console.log(Deno.inspect(api, {depth: 20}));

function stringifyPath(pathNodes: (HTMLElement|{nodeValue:string})[], paramList: (OpenAPIV3.ReferenceObject | OpenAPIV3.ParameterObject)[]) {

  const pathParts = pathNodes
  .map(x => x instanceof HTMLElement ? (paramList.push({
    in: 'path',
    name: x.innerText,
    schema: {
      type: 'string',
    },
  }), `{${x.innerText}}`) : x.nodeValue);
  return pathParts.join('').trim()
    .replace('[/r/{subreddit}]', '/r/{subreddit}')
    .replace(/(\.json)?$/, '.json');
}
