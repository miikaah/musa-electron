const { ipcRenderer } = require("electron");
const { create } = require("../scanner/scanner");
const { ThreadEvent } = require("./thread");

const params = ipcRenderer.sendSync(ThreadEvent.Params);

console.log("params", params);

create(params)
  .then((result) => {
    console.log("result", result);
    ipcRenderer.send(ThreadEvent.Success, result);
  })
  .catch((e) => {
    console.log("e", e);
    ipcRenderer.send(ThreadEvent.Error, e);
  });
