import prepareAppsExtensions from './prepare-apps';
import { extensions as isolateExtensions } from './isolate-sim';


let extensions = {};

let allExtensions = [prepareAppsExtensions, isolateExtensions];
for (let obj of allExtensions) {
  Object.assign(extensions, obj);
}

export default extensions;
