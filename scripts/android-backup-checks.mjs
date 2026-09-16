// Input is Google's compiled XmlNode JSON, decoded from the actual AAB resources.
const domains = ['root', 'file', 'database', 'sharedpref', 'external'];
const legacy = 'aptly_backup_rules';
const extraction = 'aptly_data_extraction_rules';

export function inspectAndroidBackupResources(resources) {
  const errors = [];
  const element = (node) => node?.element;
  const children = (node) => (node?.child ?? []).filter((child) => child.element).map(element);
  const validName = (node, name) => node?.name === name && !node.namespaceUri;
  function inspectExcludes(scope, path) {
    const excluded = new Set();
    for (const rule of children(scope)) {
      const attrs = rule.attribute ?? [];
      const attributes = Object.fromEntries(attrs.map((attr) => [attr.name, attr.value]));
      if (
        !validName(rule, 'exclude') ||
        attrs.length !== 2 ||
        attrs.some((attr) => attr.namespaceUri) ||
        children(rule).length ||
        attributes.path !== '.' ||
        !domains.includes(attributes.domain)
      )
        errors.push(`${path}: unexpected or partial backup rule; review before release.`);
      else excluded.add(attributes.domain);
    }
    for (const domain of domains) {
      if (!excluded.has(domain)) errors.push(`${path}: missing complete exclusion for ${domain}.`);
    }
  }
  for (const name of [legacy, extraction]) {
    const base = `base/res/xml/${name}.xml`;
    if (!resources[base]) errors.push(`Missing packaged backup resource: ${base}.`);
    // Android can select qualified resources instead of the default. Check every variant.
    for (const [path, document] of Object.entries(resources)) {
      if (!new RegExp(`^base/res/xml(?:-[^/]+)?/${name}\\.xml$`).test(path)) continue;
      const root = element(document);
      if (name === legacy) {
        if (!validName(root, 'full-backup-content')) errors.push(`${path}: invalid backup root.`);
        else inspectExcludes(root, path);
      } else if (!validName(root, 'data-extraction-rules'))
        errors.push(`${path}: invalid backup root.`);
      else {
        const scopes = children(root);
        if (scopes.some((scope) => !['cloud-backup', 'device-transfer'].includes(scope.name)))
          errors.push(`${path}: unexpected extraction scope; review before release.`);
        for (const name of ['cloud-backup', 'device-transfer']) {
          const matches = scopes.filter((scope) => validName(scope, name));
          if (matches.length !== 1) errors.push(`${path}: expected exactly one ${name} scope.`);
          else inspectExcludes(matches[0], `${path}/${name}`);
        }
      }
    }
  }
  return errors;
}
