'use strict';
const fs = require('node:fs');
const path = require('node:path');

// Embed app-owned assets; preserve inline scripts and their markup-like strings.
function embedRenderer(html, appDirectory) {
  const root = fs.realpathSync(appDirectory);
  const attribute = (attrs, name) =>
    new RegExp('(?:^|\\s)' + name + '\\s*=\\s*(["\'])(.*?)\\1', 'i').exec(attrs)?.[2];
  const external = reference => /^(?:https?:|data:|\/\/)/i.test(reference);
  function read(reference) {
    const file = path.resolve(root, decodeURIComponent(reference.split(/[?#]/)[0]));
    const real = fs.realpathSync(file);
    if (!file.startsWith(root + path.sep) || !real.startsWith(root + path.sep)) {
      throw Error('Preview asset outside app directory: ' + reference);
    }
    return fs.readFileSync(real, 'utf8');
  }
  return html.replace(
    /<script\b([^>]*)>[\s\S]*?<\/script\s*>|<link\b([^>]*)>/gi,
    (tag, scriptAttrs, linkAttrs) => {
      if (scriptAttrs !== undefined) {
        const reference = attribute(scriptAttrs, 'src');
        if (!reference || external(reference)) return tag;
        return '<script>\n' + read(reference).replace(/<\/script/gi, '<\\/script') + '\n</script>';
      }
      const reference = attribute(linkAttrs, 'href');
      if (!reference || external(reference) || attribute(linkAttrs, 'rel') !== 'stylesheet') return tag;
      return '<style>' + read(reference).replace(/<\/style/gi, '<\\/style') + '</style>';
    },
  );
}
module.exports = { embedRenderer };
