/**
 * Holds the different project types where there is a template stored for it.
 *
 * This is the single source of truth for the project types.
 */
type ProjectTypes = {
  'node-cli': 'node-cli';
  node: 'node';
};

/**
 * A string representing a type of project that can be built from a template.
 */
export type ProjectType = keyof ProjectTypes;

/**
 * Info on a particular template project.
 */
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
    folderName: 'node-cli-project'
  },
  node: {
    name: 'node',
    description: 'Can be used to start a new simple node project',
    folderName: 'node-project'
  }
};

export default templates;
