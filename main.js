const {
    app,
    BrowserWindow,
    ipcMain,
    desktopCapturer,
    shell
} = require("electron");

const fs = require("fs");
const path = require("path");
const ffmpegPath = require("ffmpeg-static");
const { execFile, spawn } = require("child_process");

const settingsFile = path.join(
    app.getPath("userData"),
    "settings.json"
);

const defaultRecordingsFolder = path.join(
    app.getPath("videos"),
    "Screen Studio"
);

let recordingsFolder = defaultRecordingsFolder;

let mainWindow = null;
let toolbarWindow = null;
let recordingPaused = false;
let recordingActive = false;
let recordingElapsedSeconds = 0;
let recordingTimerInterval = null;

function applyConfiguredFolders(settings) {
    const targetFolder =
        settings &&
        typeof settings.saveLocation === "string" &&
        settings.saveLocation.trim().length > 0
            ? path.resolve(settings.saveLocation.trim())
            : defaultRecordingsFolder;

    recordingsFolder = targetFolder;
}

function createRecordingsFolder() {
    const settings = loadSettings();
    applyConfiguredFolders(settings);

    if (!fs.existsSync(recordingsFolder)) {
        fs.mkdirSync(recordingsFolder, { recursive: true });
    }
}

function getFfmpegExecutablePath() {
    if (!ffmpegPath) {
        throw new Error("FFmpeg executable was not found.");
    }

    const executablePath = app.isPackaged
        ? path.join(
            process.resourcesPath,
            "app.asar.unpacked",
            path.relative(app.getAppPath(), ffmpegPath)
        )
        : ffmpegPath;

    if (!fs.existsSync(executablePath)) {
        throw new Error(`FFmpeg executable was not found: ${executablePath}`);
    }

    return executablePath;
}

function loadSettings() {
    const defaults = {
        quality: "1080",
        format: "mp4",
        microphone: true,
        systemAudio: true,
        floatingToolbar: true,
        hideNotifications: false,
        saveLocation: defaultRecordingsFolder
    };

    try {
        if (fs.existsSync(settingsFile)) {
            const savedSettings = JSON.parse(
                fs.readFileSync(settingsFile, "utf8")
            );

            const resolvedSettings = {
                ...defaults,
                ...savedSettings
            };

            applyConfiguredFolders(resolvedSettings);
            return resolvedSettings;
        }
    } catch (error) {
        console.error("Could not load settings:", error);
    }

    applyConfiguredFolders(defaults);
    return defaults;
}

function createWindow() {
    const window = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        icon: path.join(__dirname, "assets", "icon.PNG"),
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    mainWindow = window;
    window.loadFile(path.join(__dirname, "index.html"));

    window.on("closed", () => {
        if (mainWindow === window) {
            mainWindow = null;
        }
    });
}


async function createToolbarWindow() {
    if (toolbarWindow && !toolbarWindow.isDestroyed()) {
        toolbarWindow.show();
        toolbarWindow.focus();
        return toolbarWindow;
    }

    const window = new BrowserWindow({
        width: 360,
        height: 90,
        frame: false,
        resizable: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        autoHideMenuBar: true,
        show: false,
        backgroundColor: "#111720",
        webPreferences: {
            preload: path.join(__dirname, "toolbar-preload.js"),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    toolbarWindow = window;
    window.setContentProtection(true);

    window.webContents.on("did-fail-load", (event, errorCode, errorDescription) => {
        console.error("Toolbar failed to load:", errorCode, errorDescription);
    });

    window.on("closed", () => {
        if (toolbarWindow === window) {
            toolbarWindow = null;
        }
    });

    try {
        await window.loadFile(path.join(__dirname, "toolbar.html"));

        if (window.isDestroyed()) {
            throw new Error("Toolbar window was closed before it could be shown.");
        }

        window.show();
        window.focus();
        window.setAlwaysOnTop(true);
        return window;
    } catch (error) {
        if (toolbarWindow === window) {
            toolbarWindow = null;
        }

        if (!window.isDestroyed()) {
            window.destroy();
        }

        throw new Error("Could not open the recording toolbar.", { cause: error });
    }
}


function createAreaSelectionWindow() {
    const areaWindow = new BrowserWindow({
        fullscreen: true,
        transparent: true,
        frame: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        backgroundColor: "#00000000",
        webPreferences: {
            preload: path.join(__dirname, "area-preload.js"),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    areaWindow.loadFile("area-selection.html");
    return areaWindow;
}

ipcMain.handle("get-sources", async () => {
    const sources = await desktopCapturer.getSources({
        types: ["screen", "window"],
        thumbnailSize: {
            width: 320,
            height: 180
        }
    });

    return sources.map((source) => ({
        id: source.id,
        name: source.name,
        thumbnail: source.thumbnail.toDataURL()
    }));
});

let areaSelectionWindow = null;

ipcMain.handle("select-recording-area", async () => {
    if (areaSelectionWindow && !areaSelectionWindow.isDestroyed()) {
        areaSelectionWindow.destroy();
        areaSelectionWindow = null;
    }

    return new Promise((resolve, reject) => {
        const areaWindow = createAreaSelectionWindow();
        areaSelectionWindow = areaWindow;

        let finished = false;

        const cleanup = () => {
            ipcMain.removeListener("area-selection-confirm", handleConfirm);
            ipcMain.removeListener("area-selection-cancel", handleCancel);

            if (!areaWindow.isDestroyed()) {
                areaWindow.close();
            }

            if (areaSelectionWindow === areaWindow) {
                areaSelectionWindow = null;
            }
        };

        const handleConfirm = (event, rect) => {
            if (
                !rect ||
                !Number.isFinite(rect.x) ||
                !Number.isFinite(rect.y) ||
                !Number.isFinite(rect.width) ||
                !Number.isFinite(rect.height) ||
                rect.width < 20 ||
                rect.height < 20
            ) {
                return;
            }

            if (finished) return;
            finished = true;

            cleanup();
            resolve(rect);
        };

        const handleCancel = () => {
            if (finished) return;
            finished = true;

            cleanup();
            reject(new Error("Area selection cancelled."));
        };

        ipcMain.on("area-selection-confirm", handleConfirm);
        ipcMain.on("area-selection-cancel", handleCancel);

        areaWindow.on("closed", () => {
            ipcMain.removeListener("area-selection-confirm", handleConfirm);
            ipcMain.removeListener("area-selection-cancel", handleCancel);

            if (areaSelectionWindow === areaWindow) {
                areaSelectionWindow = null;
            }

            if (!finished) {
                finished = true;
                reject(new Error("Area selection window closed."));
            }
        });
    });
});

let currentRecordingPath = null;
let currentRecordingStream = null;

function formatRecordingTime(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return [
        hours,
        minutes,
        seconds
    ].map(value => String(value).padStart(2, "0")).join(":");
}

function sendToolbarTimerUpdate() {
    if (toolbarWindow && !toolbarWindow.isDestroyed()) {
        toolbarWindow.webContents.send("toolbar-timer-update", {
            time: formatRecordingTime(recordingElapsedSeconds),
            paused: recordingPaused
        });
    }
}

function startRecordingTimer() {
    stopRecordingTimer();

    recordingElapsedSeconds = 0;
    recordingPaused = false;

    sendToolbarTimerUpdate();

    recordingTimerInterval = setInterval(() => {
        if (!recordingActive || recordingPaused) {
            return;
        }

        recordingElapsedSeconds++;
        sendToolbarTimerUpdate();
    }, 1000);
}

function stopRecordingTimer() {
    if (recordingTimerInterval) {
        clearInterval(recordingTimerInterval);
        recordingTimerInterval = null;
    }
}


ipcMain.handle("toolbar-stop-recording", async () => {
    if (!recordingActive) {
        return { success: false };
    }

    recordingActive = false;
    recordingPaused = false;
    stopRecordingTimer();
    sendToolbarTimerUpdate();

    if (toolbarWindow && !toolbarWindow.isDestroyed()) {
        toolbarWindow.webContents.send("toolbar-recording-stopped");
        toolbarWindow.hide();
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show();
        mainWindow.focus();
        mainWindow.webContents.send("toolbar-stop-request");
    }

    return { success: true };
});

ipcMain.handle("start-saving-recording", async () => {
    createRecordingsFolder();

    const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, "-");

    const fileName = `Recording_${timestamp}.webm`;

    currentRecordingPath = path.join(recordingsFolder, fileName);
    currentRecordingStream = fs.createWriteStream(currentRecordingPath);

    await new Promise((resolve, reject) => {
        currentRecordingStream.once("open", resolve);
        currentRecordingStream.once("error", reject);
    });

    return {
        success: true,
        fileName
    };
});

ipcMain.handle("recording-ui-started", async () => {
    if (recordingActive) {
        return { success: false };
    }

    const settings = loadSettings();

    if (settings.floatingToolbar) {
        const window = await createToolbarWindow();

        if (window.isDestroyed() || !window.isVisible()) {
            throw new Error("The recording toolbar could not be displayed.");
        }

        if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
            mainWindow.hide();
            await new Promise(resolve => setTimeout(resolve, 200));
        }
    }

    return { success: true };
});

ipcMain.handle("recording-ui-recording", async () => {
    if (recordingActive) {
        return { success: false };
    }

    recordingActive = true;
    startRecordingTimer();

    return { success: true };
});

ipcMain.handle("recording-ui-stopping", async () => {
    recordingActive = false;
    recordingPaused = false;
    stopRecordingTimer();
    sendToolbarTimerUpdate();

    if (toolbarWindow && !toolbarWindow.isDestroyed()) {
        toolbarWindow.webContents.send("toolbar-recording-stopped");
    }

    return { success: true };
});


ipcMain.handle("recording-ui-finished", async () => {
recordingActive = false;
recordingPaused = false;

if (recordingTimerInterval) {
    clearInterval(recordingTimerInterval);
    recordingTimerInterval = null;
}

if (toolbarWindow && !toolbarWindow.isDestroyed()) {
    toolbarWindow.close();
}

if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
}

return { success: true };

});


ipcMain.handle("save-recording-chunk", async (event, chunk) => {
    if (!currentRecordingStream || !currentRecordingPath) {
        throw new Error("No recording file is open.");
    }

    const data = Buffer.from(chunk);

    await new Promise((resolve, reject) => {
        currentRecordingStream.write(data, error => {
            if (error) {
                reject(error);
            } else {
                resolve();
            }
        });
    });

    return { success: true };
});

ipcMain.handle("finish-saving-recording", async () => {
    if (!currentRecordingStream) {
        throw new Error("No recording is being saved.");
    }

    const stream = currentRecordingStream;
    const filePath = currentRecordingPath;

    currentRecordingStream = null;
    currentRecordingPath = null;

    await new Promise((resolve, reject) => {
        stream.once("error", reject);
        stream.end(resolve);
    });

    return {
        success: true,
        filePath,
        fileName: path.basename(filePath)
    };
});

ipcMain.handle("toolbar-pause-recording", async () => {
if (!recordingActive || recordingPaused) {
return { success: false };
}


recordingPaused = true;

if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("toolbar-pause-request");
}

if (toolbarWindow && !toolbarWindow.isDestroyed()) {
    toolbarWindow.webContents.send("toolbar-timer-update", {
        paused: true
    });
}

return { success: true };

});

ipcMain.handle("toolbar-resume-recording", async () => {
if (!recordingActive || !recordingPaused) {
return { success: false };
}

recordingPaused = false;

if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("toolbar-resume-request");
}

if (toolbarWindow && !toolbarWindow.isDestroyed()) {
    toolbarWindow.webContents.send("toolbar-timer-update", {
        paused: false
    });
}

return { success: true };

});


ipcMain.handle("get-recordings", async () => {
    createRecordingsFolder();

    const files = fs.readdirSync(recordingsFolder)
        .filter(file => /\.(webm|mp4)$/i.test(file));

    return files
        .map(file => {
            const filePath = path.join(recordingsFolder, file);
            const stats = fs.statSync(filePath);

            return {
                name: file,
                path: filePath,
                size: stats.size,
                modified: stats.mtime.toISOString()
            };
        })
        .sort((a, b) =>
            new Date(b.modified) - new Date(a.modified)
        );
});

// Generate a recording thumbnail in memory.
// No separate image file is created.
ipcMain.handle("get-recording-thumbnail", async (event, fileName) => {
    console.log("Thumbnail IPC request received:", fileName);
    
    createRecordingsFolder();

    if (
        typeof fileName !== "string" ||
        path.basename(fileName) !== fileName ||
        !/\.(webm|mp4)$/i.test(fileName)
    ) {
        throw new Error("Invalid recording file name.");
    }

    const filePath = path.join(recordingsFolder, fileName);

    if (!fs.existsSync(filePath)) {
        throw new Error("Recording file was not found.");
    }

    const ffmpegExecutablePath = getFfmpegExecutablePath();

    const attempts = [
        [
            "-hide_banner",
            "-loglevel", "error",
            "-i", filePath,
            "-frames:v", "1",
            "-vf", "scale=320:-1",
            "-c:v", "mjpeg",
            "-f", "image2pipe",
            "pipe:1"
        ],
        [
            "-hide_banner",
            "-loglevel", "error",
            "-i", filePath,
            "-frames:v", "1",
            "-c:v", "mjpeg",
            "-f", "image2pipe",
            "pipe:1"
        ]
    ];

    return new Promise((resolve, reject) => {
        let attemptIndex = 0;

        function tryGenerate() {
            console.log("Generating thumbnail:", fileName, "attempt", attemptIndex + 1);

            const ffmpeg = spawn(ffmpegExecutablePath, attempts[attemptIndex]);
            const chunks = [];
            let errorOutput = "";
            let settled = false;

            const timeout = setTimeout(() => {
                ffmpeg.kill();
                finish(new Error("Thumbnail generation timed out."));
            }, 15000);

            function finish(error, result) {
                if (settled) return;
                settled = true;
                clearTimeout(timeout);

                if (error) {
                    reject(error);
                } else {
                    resolve(result);
                }
            }

            ffmpeg.stdout.on("data", chunk => {
                chunks.push(chunk);
            });

            ffmpeg.stderr.on("data", chunk => {
                errorOutput = (errorOutput + chunk.toString()).slice(-2000);
            });

            ffmpeg.on("error", error => {
                finish(error);
            });

            ffmpeg.on("spawn", () => {
                console.log("FFmpeg started successfully.");
            });

            ffmpeg.on("close", code => {
                console.log("FFmpeg closed with code:", code);
                console.log("Thumbnail data size:", Buffer.concat(chunks).length);

                if (code === 0 && chunks.length > 0) {
                    const imageBuffer = Buffer.concat(chunks);
                    console.log("Thumbnail generated successfully.");
                    finish(
                        null,
                        "data:image/jpeg;base64," + imageBuffer.toString("base64")
                    );
                    return;
                }

                if (attemptIndex < attempts.length - 1) {
                    attemptIndex += 1;
                    tryGenerate();
                    return;
                }

                finish(
                    new Error(
                        errorOutput || "Could not generate recording thumbnail."
                    )
                );
            });
        }

        tryGenerate();
    });
});

ipcMain.handle("delete-recording", async (event, fileName) => {
    createRecordingsFolder();

    if (
        typeof fileName !== "string" ||
        path.basename(fileName) !== fileName ||
        !/\.(webm|mp4)$/i.test(fileName)
    ) {
        throw new Error("Invalid recording file name.");
    }

    const filePath = path.join(recordingsFolder, fileName);

    if (!fs.existsSync(filePath)) {
        throw new Error("Recording file was not found.");
    }

    await fs.promises.unlink(filePath);

    return { success: true };
});

ipcMain.handle("open-recording", async (event, filePath) => {
    const resolvedPath = path.resolve(filePath);
    const resolvedFolder = path.resolve(recordingsFolder);

    if (
        path.dirname(resolvedPath) !== resolvedFolder ||
        !fs.existsSync(resolvedPath)
    ) {
        throw new Error("Recording file was not found.");
    }

    const error = await shell.openPath(resolvedPath);

    if (error) {
        throw new Error(error);
    }

    return { success: true };
});

ipcMain.handle("open-recordings-folder", async () => {
    createRecordingsFolder();

    const error = await shell.openPath(recordingsFolder);

    if (error) {
        throw new Error(error);
    }

    return { success: true };
});

ipcMain.handle("get-settings", async () => {
    return loadSettings();
});

ipcMain.handle("save-settings", async (event, settings) => {
    if (!settings || typeof settings !== "object") {
        throw new Error("Invalid settings.");
    }

    const currentSettings = loadSettings();

    const allowedSettings = [
        "quality",
        "format",
        "microphone",
        "systemAudio",
        "floatingToolbar",
        "hideNotifications",
        "saveLocation"
    ];

    const updatedSettings = {
        ...currentSettings
    };

    for (const key of allowedSettings) {
        if (Object.hasOwn(settings, key)) {
            updatedSettings[key] = settings[key];
        }
    }

    if (!["1080", "720", "480"].includes(updatedSettings.quality)) {
        throw new Error("Invalid video quality.");
    }

    if (!["webm", "mp4"].includes(updatedSettings.format)) {
        throw new Error("Invalid video format.");
    }

    for (const key of [
        "microphone",
        "systemAudio",
        "floatingToolbar",
        "hideNotifications"
    ]) {
        if (typeof updatedSettings[key] !== "boolean") {
            throw new Error(`Invalid setting: ${key}`);
        }
    }

    if (typeof updatedSettings.saveLocation !== "string") {
        throw new Error("Invalid save location.");
    }

    const normalizedSaveLocation = updatedSettings.saveLocation.trim();

    if (!normalizedSaveLocation) {
        updatedSettings.saveLocation = defaultRecordingsFolder;
    } else if (!path.isAbsolute(normalizedSaveLocation)) {
        throw new Error("Invalid save location.");
    } else {
        updatedSettings.saveLocation = path.resolve(normalizedSaveLocation);
    }

    fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
    fs.writeFileSync(
        settingsFile,
        JSON.stringify(updatedSettings, null, 2),
        "utf8"
    );

    applyConfiguredFolders(updatedSettings);

    return {
        success: true,
        settings: updatedSettings
    };
});

ipcMain.handle("convert-to-mp4", async (event, filePath) => {
    const { spawn } = require("child_process");

    if (typeof filePath !== "string" || !filePath) {
        throw new Error("Recording file not found.");
    }

    const webmPath = path.resolve(filePath);
    const recordingsPath = path.resolve(recordingsFolder);

    if (
        path.dirname(webmPath) !== recordingsPath ||
        path.extname(webmPath).toLowerCase() !== ".webm" ||
        !fs.existsSync(webmPath)
    ) {
        throw new Error("Recording file not found.");
    }

    const ffmpegExecutablePath = getFfmpegExecutablePath();

    const mp4Path = path.join(
        recordingsPath,
        path.basename(webmPath, path.extname(webmPath)) + ".mp4"
    );

    const temporaryPath = path.join(
        recordingsPath,
        `.${path.basename(mp4Path, ".mp4")}.${process.pid}.${Date.now()}.tmp`
    );

    if (fs.existsSync(mp4Path)) {
        throw new Error("An MP4 file with this name already exists.");
    }

    try {
        await new Promise((resolve, reject) => {
            const ffmpeg = spawn(ffmpegExecutablePath, [
                "-y",
                "-i", webmPath,
                "-map", "0:v:0",
                "-map", "0:a?",
                "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
                "-c:v", "libx264",
                "-preset", "medium",
                "-crf", "23",
                "-pix_fmt", "yuv420p",
                "-tag:v", "avc1",
                "-c:a", "aac",
                "-b:a", "192k",
                "-movflags", "+faststart",
                "-f", "mp4",
                temporaryPath
            ]);

            let errorOutput = "";

            ffmpeg.stderr.on("data", data => {
                errorOutput = (errorOutput + data.toString()).slice(-3000);
            });

            ffmpeg.on("error", reject);

            ffmpeg.on("close", code => {
                if (
                    code === 0 &&
                    fs.existsSync(temporaryPath) &&
                    fs.statSync(temporaryPath).size > 0
                ) {
                    resolve();
                } else {
                    reject(
                        new Error(
                            "MP4 conversion failed: " +
                            errorOutput.slice(-1500)
                        )
                    );
                }
            });
        });

        await fs.promises.rename(temporaryPath, mp4Path);
        await fs.promises.unlink(webmPath);

        return {
            success: true,
            filePath: mp4Path,
            fileName: path.basename(mp4Path)
        };
    } catch (error) {
        await fs.promises.rm(temporaryPath, { force: true });
        throw error;
    }
});

app.whenReady().then(() => {
    createRecordingsFolder();
    createWindow();

    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        app.quit();
    }
});