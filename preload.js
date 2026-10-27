const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("screenStudio", {
getSources: () =>
ipcRenderer.invoke("get-sources"),


selectRecordingArea: () =>
    ipcRenderer.invoke("select-recording-area"),

startSavingRecording: () =>
    ipcRenderer.invoke("start-saving-recording"),

saveRecordingChunk: (chunk) =>
    ipcRenderer.invoke("save-recording-chunk", chunk),

finishSavingRecording: () =>
    ipcRenderer.invoke("finish-saving-recording"),

getRecordings: () =>
    ipcRenderer.invoke("get-recordings"),

getRecordingThumbnail: (fileName) =>
    ipcRenderer.invoke("get-recording-thumbnail", fileName),

deleteRecording: (fileName) =>
    ipcRenderer.invoke("delete-recording", fileName),

openRecording: (filePath) =>
    ipcRenderer.invoke("open-recording", filePath),

openRecordingsFolder: () =>
    ipcRenderer.invoke("open-recordings-folder"),

convertToMp4: (filePath) =>
    ipcRenderer.invoke("convert-to-mp4", filePath),

getSettings: () =>
    ipcRenderer.invoke("get-settings"),

saveSettings: (settings) =>
    ipcRenderer.invoke("save-settings", settings),

startRecordingUI: () =>
    ipcRenderer.invoke("recording-ui-started"),

recordingStarted: () =>
    ipcRenderer.invoke("recording-ui-recording"),

recordingStopping: () =>
    ipcRenderer.invoke("recording-ui-stopping"),

finishRecordingUI: () =>
    ipcRenderer.invoke("recording-ui-finished"),

onToolbarPause: (callback) =>
    ipcRenderer.on("toolbar-pause-request", () => callback()),

onToolbarResume: (callback) =>
    ipcRenderer.on("toolbar-resume-request", () => callback()),

onToolbarStop: (callback) =>
    ipcRenderer.on("toolbar-stop-request", () => callback())

});

contextBridge.exposeInMainWorld("areaSelection", {
confirm: (rect) =>
ipcRenderer.send("area-selection-confirm", rect),

cancel: () =>
    ipcRenderer.send("area-selection-cancel")


});
