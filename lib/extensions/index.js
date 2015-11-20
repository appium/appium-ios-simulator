import prepareAppsExtensions from './prepare-apps';


let extensions = {};

let allExtensions = [prepareAppsExtensions];
for (let obj of allExtensions) {
  Object.assign(extensions, obj);
}

export default extensions;
