import { DOMParser, HTMLElement } from "https://esm.sh/linkedom@0.14.12/cached";
import { Text } from "https://esm.sh/v92/linkedom@0.14.12/types/interface/text.d.ts";
import { NodeStruct } from "https://esm.sh/v92/linkedom@0.14.12/types/mixin/parent-node.d.ts";

const text = await fetch('https://www.reddit.com/dev/api').then(x => x.text());
// const text = await Deno.readTextFile('reddit-api.html');

const document = new DOMParser().parseFromString("<body><div>hello</div></body>", 'text/html');

// attempt to pretty print DOM nodes in Deno.inspect
document.querySelector('div').constructor.prototype[Symbol.for("Deno.customInspect")] = function(this: NodeStruct, inspect: typeof Deno.inspect, opts: Deno.InspectOptions) {
  const opening = `${this.localName} ${this.attributes.join(' ')}`.trimEnd();
  if (this.childNodes.length == 0) return `<${opening} />`;
  if ((opts.depth ?? 4) <= 1) return [
    `<${opening}>`,
    `  [ ... ]`,
    `</${this.localName}>`,
  ].join('\n');
  return [
    `<${opening}>`,
    ...this.childNodes.map(y => inspect(y, {...opts, depth: (opts.depth ?? 4)-1}).replace(/^/gm, '  ')),
    `</${this.localName}>`,
  ].join('\n');
}
document.querySelector('div').childNodes[0].constructor.prototype[Symbol.for("Deno.customInspect")] = function(this: Text, inspect: typeof Deno.inspect, opts: Deno.InspectOptions) {
  return inspect(this.nodeValue, {...opts, depth: (opts.depth ?? 4)-1});
}
