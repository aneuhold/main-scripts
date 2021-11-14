import CurrentEnv from '../helperFunctions/CurrentEnv';

export default async function startup(): Promise<void> {
  await CurrentEnv.runStartupScript();
}
