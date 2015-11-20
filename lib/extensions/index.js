import prepareAppsExtensions from './prepare-apps';
import isolateExtensions from './isolate-sim';


let extensions = {};

let allExtensions = [prepareAppsExtensions, isolateExtensions];
for (let obj of allExtensions) {
  Object.assign(extensions, obj);
}

export default extensions;
