import { logger } from 'appium-support';
import _ from 'lodash';


let prefix = 'iOSSim';
function setLoggingPlatform (platform) {
  if (!_.isEmpty(platform)) {
    prefix = `${platform}Sim`;
  }
}

const log = logger.getLogger(function getPrefix () {
  return prefix;
});


export { log, setLoggingPlatform };
export default log;
