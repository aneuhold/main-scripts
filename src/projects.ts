export type Project = {
  folderName: string;
  solutionFilePath?: string;
};

export enum FolderName {
  piSpa = 'pi-spa',
  piDiagnoseApiService = 'pi-diagnoseapiservice',
}

/**
 * Contains the different projects that have settings based on the folder name.
 *
 * The folder name is repeated in the key and the data structure for easier
 * access.
 */
const projects: { [folderName in FolderName]: Project } = {
  'pi-spa': {
    folderName: FolderName.piSpa,
  },
  'pi-diagnoseapiservice': {
    folderName: FolderName.piSpa,
    solutionFilePath: 'PI.DiagnoseApiService.sln',
  },
};

export default projects;
