const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("areaSelection", {
    confirm: (rect) => {
        console.log("Sending selected area:", rect);
        ipcRenderer.send("area-selection-confirm", rect);
    },

    cancel: () => {
        ipcRenderer.send("area-selection-cancel");
    }
});