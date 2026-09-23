/* Where the plugin files are, seen from this page: ../plugin/ in the development
 * tree, ../../ when this folder is <plugin>/dev/preview inside a vault. */
window.__TUFTE_PLUGIN = /\/dev\/preview\//.test(location.pathname) ? "../../" : "../plugin/";
