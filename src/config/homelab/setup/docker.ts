import { DR } from '@aneuhold/core-ts-lib';
import HomeLabNetworkService from '../../../services/HomeLab/HomeLabNetworkService.js';
import {
  HomeLabApplication,
  HomeLabApplicationInfo,
  HomeLabMachine
} from '../types.js';

export const dockerApplication: HomeLabApplicationInfo = {
  id: HomeLabApplication.Docker,
  ops: {
    deploy: () => {
      DR.logger.info(`Installing Docker on ${HomeLabMachine.Pi1}...`);
      const exitCode = HomeLabNetworkService.sshRun(
        HomeLabMachine.Pi1,
        'curl -fsSL https://get.docker.com | sudo sh && sudo usermod -aG docker neuholda'
      );
      if (exitCode !== 0) {
        DR.logger.error(
          `Docker installation failed on ${HomeLabMachine.Pi1} (exit ${exitCode})`
        );
        process.exit(exitCode);
      }
      DR.logger.info(`Docker installed on ${HomeLabMachine.Pi1}`);
      DR.logger.info(
        'Log out and back in (or re-SSH) for group membership to take effect.'
      );
    }
  }
};
