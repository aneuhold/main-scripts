/**
 * Holds the different project types where there is a template stored for it.
 *
 * This is the single source of truth for the project types.
 */
const projectTypes = {
  'node-cli': 'node-cli',
};

export type ProjectType = keyof typeof projectTypes;

export type TemplateInfo = {
  name: string;
  description: string;
  folderName: string;
};

export type Templates = {
  [Property in ProjectType]: TemplateInfo;
};

/**
 * Information on the different templates that are available.
 */
const templates: Templates = {
  'node-cli': {
    name: 'node-cli',
    description: 'Can be used to build a node CLI.',
    folderName: 'node-cli-project',
  },
};

export default templates;
