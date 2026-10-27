const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("recordingToolbar", {
    pauseRecording: () =>
        ipcRenderer.invoke("toolbar-pause-recording"),

    resumeRecording: () =>
        ipcRenderer.invoke("toolbar-resume-recording"),

    stopRecording: () =>
        ipcRenderer.invoke("toolbar-stop-recording"),

    onTimerUpdate: (callback) => {
        ipcRenderer.on("toolbar-timer-update", (_event, data) => {
            callback(data);
        });
    },

    onRecordingStopped: (callback) => {
        ipcRenderer.on("toolbar-recording-stopped", () => {
            callback();
        });
    }
});