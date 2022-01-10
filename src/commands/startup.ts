import CurrentEnv from '../utils/CurrentEnv';

export default async function startup(): Promise<void> {
  await CurrentEnv.runStartupScript();
}
