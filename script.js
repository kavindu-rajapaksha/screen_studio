const timer = document.getElementById("timer");
const startBtn = document.getElementById("start");
const pauseBtn = document.getElementById("pause");
const stopBtn = document.getElementById("stop");
const statusText = document.getElementById("status");
const note = document.getElementById("note");

const qualitySelect = document.getElementById("quality");
const previewText = document.getElementById("previewText");

// Settings page elements
const settingsQuality = document.getElementById("settingsQuality");
const videoFormat = document.getElementById("videoFormat");
const settingsMicrophone = document.getElementById("settingsMicrophone");
const settingsSystemAudio = document.getElementById("settingsSystemAudio");
const settingsSaveLocation = document.getElementById("settingsSaveLocation");
const hideNotifications = document.getElementById("hideNotifications");
const floatingToolbar = document.getElementById("floatingToolbar");
const saveSettingsBtn = document.getElementById("saveSettings");
const resetSettingsBtn = document.getElementById("resetSettings");
const settingsMessage = document.getElementById("settingsMessage");

let appSettings = {
    quality: "1080",
    format: "mp4",
    microphone: true,
    systemAudio: true,
    floatingToolbar: true,
    hideNotifications: false,
    saveLocation: ""
};

function updateSettingsUI(settings) {
    appSettings = { ...appSettings, ...settings };

    const recordMicrophone = document.getElementById("microphoneEnabled");
    const recordSystemAudio = document.getElementById("systemAudioEnabled");

    if (recordMicrophone) {
        recordMicrophone.checked = appSettings.microphone;
    }

    if (recordSystemAudio) {
        recordSystemAudio.checked = appSettings.systemAudio;
    }

    if (settingsQuality) settingsQuality.value = appSettings.quality;
    if (videoFormat) videoFormat.value = appSettings.format;
    if (settingsMicrophone) settingsMicrophone.checked = appSettings.microphone;
    if (settingsSystemAudio) settingsSystemAudio.checked = appSettings.systemAudio;
    if (hideNotifications) hideNotifications.checked = appSettings.hideNotifications;
    if (floatingToolbar) floatingToolbar.checked = appSettings.floatingToolbar;
    if (settingsSaveLocation) settingsSaveLocation.value = appSettings.saveLocation;
    if (qualitySelect) qualitySelect.value = appSettings.quality;
}

async function loadAppSettings() {
    try {
        const settings = await window.screenStudio.getSettings();
        updateSettingsUI(settings);
    } catch (error) {
        console.error("Could not load settings:", error);
    }
}

if (settingsQuality) {
    settingsQuality.addEventListener("change", () => {
        if (qualitySelect) qualitySelect.value = settingsQuality.value;
    });
}

if (qualitySelect) {
    qualitySelect.addEventListener("change", () => {
        if (settingsQuality) settingsQuality.value = qualitySelect.value;
    });
}

if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener("click", async () => {
        const newSettings = {
            quality: settingsQuality ? settingsQuality.value : "1080",
            format: videoFormat ? videoFormat.value : "mp4",
            microphone: settingsMicrophone ? settingsMicrophone.checked : true,
            systemAudio: settingsSystemAudio ? settingsSystemAudio.checked : true,
            hideNotifications: hideNotifications ? hideNotifications.checked : false,
            floatingToolbar: floatingToolbar ? floatingToolbar.checked : true,
            saveLocation: settingsSaveLocation ? settingsSaveLocation.value : ""
        };

        try {
            const result = await window.screenStudio.saveSettings(newSettings);

            if (result && result.success) {
                updateSettingsUI(result.settings);
                settingsMessage.textContent = "Settings saved successfully.";
                settingsMessage.style.color = "#6be6a8";
            }
        } catch (error) {
            settingsMessage.textContent = "Could not save settings: " + error.message;
            settingsMessage.style.color = "#ff7777";
        }
    });
}

if (resetSettingsBtn) {
    resetSettingsBtn.addEventListener("click", async () => {
        const defaults = {
            quality: "1080",
            format: "mp4",
            microphone: true,
            systemAudio: true,
            floatingToolbar: true,
            hideNotifications: false,
            saveLocation: ""
        };

        try {
            const result = await window.screenStudio.saveSettings(defaults);

            if (result && result.success) {
                updateSettingsUI(result.settings);
                settingsMessage.textContent = "Settings restored to defaults.";
                settingsMessage.style.color = "#6be6a8";
            }
        } catch (error) {
            settingsMessage.textContent = "Could not reset settings: " + error.message;
            settingsMessage.style.color = "#ff7777";
        }
    });
}

loadAppSettings();

let recorder = null;
let screenStream = null;
let microphoneStream = null;
let interval = null;
let seconds = 0;
let paused = false;
let selectedRecordingArea = null;

function updateTimer() {
    const hours = String(Math.floor(seconds / 3600)).padStart(2, "0");
    const minutes = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
    const secs = String(seconds % 60).padStart(2, "0");

    if (timer) {
        timer.textContent = `${hours}:${minutes}:${secs}`;
    }
}

function startTimer() {
    clearInterval(interval);

    interval = setInterval(() => {
        if (!paused) {
            seconds++;
            updateTimer();
        }
    }, 1000);
}

function stopTimer() {
    clearInterval(interval);
    interval = null;
}

function getSelectedSource() {
    const selectedButton = document.querySelector(".source.selected");

    if (!selectedButton) {
        throw new Error("Please select a recording source.");
    }

    return selectedButton.dataset.source;
}

function ensureSourceDialog() {
    let dialog = document.getElementById("sourceDialog");
    if (dialog) return dialog;

    dialog = document.createElement("div");
    dialog.id = "sourceDialog";
    dialog.style.position = "fixed";
    dialog.style.inset = "0";
    dialog.style.background = "rgba(0,0,0,0.5)";
    dialog.style.display = "none";
    dialog.style.alignItems = "center";
    dialog.style.justifyContent = "center";
    dialog.style.zIndex = "1000";

    const panel = document.createElement("div");
    panel.style.width = "420px";
    panel.style.maxWidth = "90vw";
    panel.style.background = "#111827";
    panel.style.border = "1px solid #2d3748";
    panel.style.borderRadius = "12px";
    panel.style.padding = "20px";
    panel.style.boxShadow = "0 12px 30px rgba(0,0,0,0.35)";

    const title = document.createElement("h3");
    title.textContent = "Choose a source";
    title.style.margin = "0 0 16px";
    title.style.color = "#ffffff";

    const list = document.createElement("div");
    list.id = "sourceList";
    list.style.display = "flex";
    list.style.flexDirection = "column";
    list.style.gap = "8px";

    const cancel = document.createElement("button");
    cancel.id = "cancelSourceSelection";
    cancel.type = "button";
    cancel.textContent = "Cancel";
    cancel.style.marginTop = "16px";
    cancel.style.padding = "10px 14px";
    cancel.style.borderRadius = "8px";
    cancel.style.border = "1px solid #4b5563";
    cancel.style.background = "#1f2937";
    cancel.style.color = "#fff";
    cancel.style.cursor = "pointer";

    panel.appendChild(title);
    panel.appendChild(list);
    panel.appendChild(cancel);
    dialog.appendChild(panel);

    document.body.appendChild(dialog);

    return dialog;
}

function showSourceDialog(sources) {
    return new Promise((resolve, reject) => {
        const dialog = ensureSourceDialog();
        const sourceList = document.getElementById("sourceList");
        const cancelButton = document.getElementById("cancelSourceSelection");

        if (!sourceList || !cancelButton) {
            reject(new Error("Source chooser unavailable."));
            return;
        }

        sourceList.innerHTML = "";
        dialog.style.display = "flex";

        function cleanup() {
            dialog.style.display = "none";
            cancelButton.removeEventListener("click", handleCancel);
        }

        function handleCancel() {
            cleanup();
            reject(new Error("Source selection cancelled."));
        }

        sources.forEach(source => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "source-option";
            button.textContent = source.name;
            button.style.padding = "12px 14px";
            button.style.borderRadius = "8px";
            button.style.border = "1px solid #374151";
            button.style.background = "#1f2937";
            button.style.color = "#fff";
            button.style.cursor = "pointer";
            button.style.textAlign = "left";

            button.addEventListener("click", () => {
                cleanup();
                resolve(source);
            });

            sourceList.appendChild(button);
        });

        cancelButton.addEventListener("click", handleCancel);
    });
}

async function getRecordingSource() {
    const sourceType = getSelectedSource();
    const sources = await window.screenStudio.getSources();

    if (!sources || sources.length === 0) {
        throw new Error("No recording sources found.");
    }

    if (sourceType === "area") {
        if (previewText) {
            previewText.textContent = "Select the area to record...";
        }

        selectedRecordingArea = await window.screenStudio.selectRecordingArea();
        const rect = selectedRecordingArea;
        const screenSources = sources.filter(source => source.id.startsWith("screen:"));

        if (screenSources.length === 0) {
            throw new Error("No screen source found.");
        }

        let source = screenSources[0];

        if (screenSources.length > 1) {
            source = await showSourceDialog(screenSources);
        }

        if (!source) {
            throw new Error("No screen source selected.");
        }

        return {
            ...source,
            type: "area",
            rect
        };
    }

    let availableSources = [];

    if (sourceType === "screen") {
        availableSources = sources.filter(source => source.id.startsWith("screen:"));
    } else if (sourceType === "window") {
        availableSources = sources.filter(source => source.id.startsWith("window:"));
    }

    if (availableSources.length === 0) {
        throw new Error("No matching source found. Please check the available sources.");
    }

    if (availableSources.length === 1) {
        return availableSources[0];
    }

    return await showSourceDialog(availableSources);
}

async function startRecording() {
    let recordingUIStarted = false;

    try {
        startBtn.disabled = true;
        statusText.textContent = "Preparing recording...";
        note.textContent = "Preparing screen and audio inputs...";

        const source = await getRecordingSource();

        if (!source || !source.id) {
            throw new Error("No recording source selected.");
        }

        const uiResult = await window.screenStudio.startRecordingUI();

        if (!uiResult || !uiResult.success) {
            throw new Error("Could not initialize the recording toolbar.");
        }

        recordingUIStarted = true;

        const quality = qualitySelect ? qualitySelect.value : "1080";

        let height = 1080;
        let frameRate = 30;

        if (quality === "720") {
            height = 720;
            frameRate = 30;
        } else if (quality === "480") {
            height = 480;
            frameRate = 24;
        } else if (quality === "1080") {
            height = 1080;
            frameRate = 30;
        }

        const systemAudioEnabled = appSettings.systemAudio;
        console.log("System Audio:", systemAudioEnabled);

        const constraints = {
            audio: systemAudioEnabled
                ? {
                    mandatory: {
                        chromeMediaSource: "desktop",
                        chromeMediaSourceId: source.id
                    }
                }
                : false,
            video: {
                mandatory: {
                    chromeMediaSource: "desktop",
                    chromeMediaSourceId: source.id,
                    maxHeight: height,
                    maxFrameRate: frameRate
                }
            }
        };

        screenStream = await navigator.mediaDevices.getUserMedia(constraints);

        let recordingVideoStream = screenStream;

        if (source.type === "area" && source.rect) {
            const video = document.createElement("video");
            video.srcObject = screenStream;
            video.muted = true;
            video.playsInline = true;

            await video.play();

            await new Promise(resolve => {
                if (video.videoWidth > 0) {
                    resolve();
                } else {
                    video.addEventListener("loadedmetadata", resolve, { once: true });
                }
            });

            const rect = source.rect;

            const scaleX = video.videoWidth / rect.viewportWidth;
            const scaleY = video.videoHeight / rect.viewportHeight;

            const cropX = Math.round(rect.x * scaleX);
            const cropY = Math.round(rect.y * scaleY);
            const cropWidth = Math.round(rect.width * scaleX);
            const cropHeight = Math.round(rect.height * scaleY);

            if (
                cropWidth <= 0 ||
                cropHeight <= 0 ||
                cropX < 0 ||
                cropY < 0 ||
                cropX + cropWidth > video.videoWidth ||
                cropY + cropHeight > video.videoHeight
            ) {
                if (screenStream && screenStream.getTracks) {
                    screenStream.getTracks().forEach(track => track.stop());
                }
                throw new Error("Invalid recording area. Please select the area again.");
            }

            const canvas = document.createElement("canvas");
            canvas.width = cropWidth;
            canvas.height = cropHeight;

            const context = canvas.getContext("2d");

            function drawFrame() {
                if (video.readyState >= 2 && video.videoWidth > 0) {
                    context.drawImage(
                        video,
                        cropX,
                        cropY,
                        cropWidth,
                        cropHeight,
                        0,
                        0,
                        canvas.width,
                        canvas.height
                    );
                }

                if (screenStream && screenStream.active) {
                    requestAnimationFrame(drawFrame);
                }
            }

            drawFrame();
            recordingVideoStream = canvas.captureStream(30);
        }

        const videoTracks = recordingVideoStream.getVideoTracks();

const microphoneEnabled = appSettings.microphone;

console.log("System Audio:", systemAudioEnabled);
console.log("Microphone:", microphoneEnabled);

const audioContext = new AudioContext();
const audioDestination = audioContext.createMediaStreamDestination();

let audioSourceCount = 0;

if (systemAudioEnabled && screenStream) {
    const systemAudioTracks = screenStream.getAudioTracks();

    console.log("System audio tracks:", systemAudioTracks.length);

    if (systemAudioTracks.length > 0) {
        const systemAudioStream = new MediaStream(systemAudioTracks);
        const systemAudioSource =
            audioContext.createMediaStreamSource(systemAudioStream);

        systemAudioSource.connect(audioDestination);
        audioSourceCount++;
    }
}

if (microphoneEnabled) {
    try {
        microphoneStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false
            },
            video: false
        });

        const microphoneTracks = microphoneStream.getAudioTracks();

        console.log("Microphone tracks:", microphoneTracks.length);

        if (microphoneTracks.length > 0) {
            const microphoneSource =
                audioContext.createMediaStreamSource(microphoneStream);

            microphoneSource.connect(audioDestination);
            audioSourceCount++;
        }
    } catch (error) {
        console.error("Microphone unavailable:", error);
        note.textContent = "Microphone unavailable: " + error.message;
    }
}

const combinedStream = new MediaStream(videoTracks);

if (audioSourceCount > 0) {
    combinedStream.addTrack(
        audioDestination.stream.getAudioTracks()[0]
    );
}

console.log("Audio sources mixed:", audioSourceCount);
console.log(
    "Final recording audio tracks:",
    combinedStream.getAudioTracks().length
);

        let mimeType = "video/webm;codecs=vp9,opus";
        if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = "video/webm;codecs=vp8,opus";
        }
        if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = "video/webm";
        }

        recorder = new MediaRecorder(combinedStream, { mimeType });

        await window.screenStudio.startSavingRecording();

        let saveQueue = Promise.resolve();

        recorder.ondataavailable = event => {
            if (event.data && event.data.size > 0) {
                saveQueue = saveQueue.then(async () => {
                    const chunk = new Uint8Array(await event.data.arrayBuffer());
                    await window.screenStudio.saveRecordingChunk(chunk);
                });
            }
        };

        recorder.onerror = event => {
            console.error("Recording error:", event.error);
            note.textContent = "A recording error occurred.";
        };

        recorder.onstop = async () => {
            try {
                await saveQueue;

                statusText.textContent = "Saving recording...";
                const result = await window.screenStudio.finishSavingRecording();

                const formatPreference = appSettings.format || "mp4";

                if (formatPreference === "mp4") {
                    statusText.textContent = "Converting video to MP4...";
                    note.textContent = "Please wait while your video is converted.";

                    const mp4Result = await window.screenStudio.convertToMp4(result.filePath);

                    statusText.textContent = "Recording saved successfully";
                    note.textContent = `Saved: ${mp4Result.fileName}`;
                } else {
                    statusText.textContent = "Recording saved successfully";
                    note.textContent = `Saved: ${result.fileName}`;
                }
            } catch (error) {
                console.error("Save error:", error);
                statusText.textContent = "Could not save recording";
                note.textContent = error.message;
            } finally {
                if (screenStream && screenStream.getTracks) {
                    screenStream.getTracks().forEach(track => track.stop());
                }

                if (microphoneStream && microphoneStream.getTracks) {
                    microphoneStream.getTracks().forEach(track => track.stop());
                }

                if (audioContext && audioContext.state !== "closed") {
                    await audioContext.close();
                }

                screenStream = null;
                microphoneStream = null;

                startBtn.disabled = false;
                pauseBtn.disabled = true;
                stopBtn.disabled = true;

                pauseBtn.textContent = "Ⅱ Pause";
                stopTimer();

                try {
                    await window.screenStudio.finishRecordingUI();
                } catch (error) {
                    console.error("Failed to finish recording UI:", error);
                }
            }
        };

        seconds = 0;
        paused = false;
        updateTimer();
        startTimer();

        startBtn.disabled = true;
        pauseBtn.disabled = false;
        stopBtn.disabled = false;

        const recordingResult = await window.screenStudio.recordingStarted();

        if (!recordingResult || !recordingResult.success) {
            throw new Error("Could not start the recording timer.");
        }

        recorder.start(1000);

        statusText.textContent = "Recording in progress";
        note.textContent = `Recording: ${source.name}`;
        if (previewText) previewText.textContent = `${source.name} is being recorded`;
    } catch (error) {
        console.error("Could not start recording:", error);

        statusText.textContent = "Could not start recording";
        note.textContent = error.message || "An unknown error occurred.";

        if (screenStream && screenStream.getTracks) {
            screenStream.getTracks().forEach(track => track.stop());
        }

        if (microphoneStream && microphoneStream.getTracks) {
            microphoneStream.getTracks().forEach(track => track.stop());
        }

        screenStream = null;
        microphoneStream = null;

        

        startBtn.disabled = false;
        pauseBtn.disabled = true;
        stopBtn.disabled = true;

        if (recordingUIStarted) {
            try {
                await window.screenStudio.recordingStopping();
                await window.screenStudio.finishRecordingUI();
            } catch (uiError) {
                console.error("Failed to close recording UI:", uiError);
            }
        }
    }
}

startBtn.addEventListener("click", startRecording);

function pauseRecording() {
if (!recorder || recorder.state !== "recording") return;

recorder.pause();
paused = true;

pauseBtn.textContent = "▶ Resume";
statusText.textContent = "Recording paused";
note.textContent = "Click Resume to continue recording.";

}

function resumeRecording() {
if (!recorder || recorder.state !== "paused") return;

recorder.resume();
paused = false;

pauseBtn.textContent = "Ⅱ Pause";
statusText.textContent = "Recording in progress";
note.textContent = "Your screen is being recorded.";

}

function stopRecording() {
if (!recorder || recorder.state === "inactive") return;

stopTimer();
statusText.textContent = "Saving recording...";
window.screenStudio.recordingStopping().catch(error => {
    console.error("Failed to stop recording timer:", error);
});
recorder.stop();

}

pauseBtn.addEventListener("click", () => {
if (recorder && recorder.state === "recording") {
pauseRecording();
} else if (recorder && recorder.state === "paused") {
resumeRecording();
}
});

window.screenStudio.onToolbarPause(pauseRecording);
window.screenStudio.onToolbarResume(resumeRecording);
window.screenStudio.onToolbarStop(stopRecording);

stopBtn.addEventListener("click", stopRecording);

// ==================================
// RECORDINGS PAGE
// ==================================

const recordingsNav = document.getElementById("recordingsNav");
const refreshRecordingsBtn = document.getElementById("refreshRecordings");
const openRecordingsFolderBtn = document.getElementById("openRecordingsFolder");
const recordingsList = document.getElementById("recordingsList");

const thumbnailCache = new Map();
const thumbnailRequests = new Map();

async function getCachedThumbnail(recording) {
    const cacheKey = `${recording.name}-${recording.size}-${recording.modified}`;

    if (thumbnailCache.has(cacheKey)) {
        return thumbnailCache.get(cacheKey);
    }

    if (thumbnailRequests.has(cacheKey)) {
        return thumbnailRequests.get(cacheKey);
    }

    const request = (async () => {
        try {
            console.log("Requesting thumbnail:", recording.name);

            const imageData = await window.screenStudio.getRecordingThumbnail(
                recording.name
            );

            console.log(
                "Thumbnail response:",
                recording.name,
                imageData ? "Received" : "Empty"
            );

            if (imageData) {
                thumbnailCache.set(cacheKey, imageData);
            }

            return imageData;
        } finally {
            thumbnailRequests.delete(cacheKey);
        }
    })();

    thumbnailRequests.set(cacheKey, request);

    return request;
}


async function loadRecordings() {
    if (!recordingsList) return;

    recordingsList.innerHTML = "<p>Loading recordings...</p>";

    try {
        const recordings = await window.screenStudio.getRecordings();

        if (!recordings || recordings.length === 0) {
            recordingsList.innerHTML = "<p>No recordings found.</p>";
            return;
        }

        recordingsList.innerHTML = "";

        recordings.forEach(recording => {
            const item = document.createElement("div");
            item.className = "recording-item";

            const thumbnail = document.createElement("img");
            thumbnail.className = "recording-thumbnail";
            thumbnail.alt = `Preview of ${recording.name}`;
            thumbnail.loading = "lazy";
            thumbnail.decoding = "async";
            thumbnail.style.display = "none";

            const thumbnailPlaceholder = document.createElement("div");
            thumbnailPlaceholder.textContent = "Generating preview...";
            thumbnailPlaceholder.style.width = "240px";
            thumbnailPlaceholder.style.aspectRatio = "16 / 9";
            thumbnailPlaceholder.style.display = "flex";
            thumbnailPlaceholder.style.alignItems = "center";
            thumbnailPlaceholder.style.justifyContent = "center";
            thumbnailPlaceholder.style.backgroundColor = "#111720";
            thumbnailPlaceholder.style.color = "#9ca3af";
            thumbnailPlaceholder.style.borderRadius = "8px";

            item.appendChild(thumbnailPlaceholder);
            item.appendChild(thumbnail);

            
            getCachedThumbnail(recording)
                .then(imageData => {
                    if (!imageData || typeof imageData !== "string") {
                        console.error(
                            "Thumbnail data is empty or invalid:",
                            recording.name
                        );

                        thumbnailPlaceholder.textContent = "Preview unavailable";
                        return;
                    }

                    const imageUrl = imageData.startsWith("data:image")
                        ? imageData
                        : `data:image/jpeg;base64,${imageData}`;

                    console.log("STEP 1: Thumbnail data received:", recording.name);
                    console.log("STEP 2: Image URL length:", imageUrl.length);

                    thumbnail.onload = () => {
                        console.log("STEP 3: THUMBNAIL LOADED:", recording.name);
                        console.log("Image width:", thumbnail.naturalWidth);
                        console.log("Image height:", thumbnail.naturalHeight);

                        thumbnail.style.display = "block";
                        thumbnailPlaceholder.remove();
                    };

                    thumbnail.onerror = () => {
                        console.error("STEP 3: THUMBNAIL FAILED:", recording.name);
                        console.error("Image URL prefix:", imageUrl.substring(0, 50));

                        thumbnail.style.display = "none";
                        thumbnailPlaceholder.textContent = "Preview unavailable";
                    };

                    console.log("STEP 2: Assigning image source:", recording.name);

                    thumbnail.src = imageUrl;

                    console.log("Assigned src:", thumbnail.getAttribute("src"));
                    console.log("Resolved src:", thumbnail.src);
                    console.log("Current src:", thumbnail.currentSrc);

                    thumbnail.style.display = "block";

                    console.log(
                        "Display after change:",
                        getComputedStyle(thumbnail).display
                    );
                })
                .catch(error => {
                    console.error(
                        "Thumbnail generation failed:",
                        recording.name,
                        error
                    );

                    thumbnailPlaceholder.textContent = "Preview unavailable";
                });


            const title = document.createElement("h3");
            title.textContent = recording.name;

            const details = document.createElement("p");
            const fileSize = (recording.size / (1024 * 1024)).toFixed(2);
            details.textContent = `File size: ${fileSize} MB`;

            const playButton = document.createElement("button");
            playButton.textContent = "Play Recording";

            playButton.addEventListener("click", async () => {
                try {
                    await window.screenStudio.openRecording(recording.path);
                } catch (error) {
                    console.error(error);
                    alert("Failed to open recording.");
                }
            });

            const deleteButton = document.createElement("button");
            deleteButton.textContent = "Delete";

            deleteButton.addEventListener("click", async () => {
                const confirmed = confirm(`Are you sure you want to delete "${recording.name}"?`);
                if (!confirmed) return;

                try {
                    await window.screenStudio.deleteRecording(recording.name);
                    await loadRecordings();
                } catch (error) {
                    console.error(error);
                    alert("Failed to delete recording.");
                }
            });

            item.appendChild(title);
            item.appendChild(details);
            item.appendChild(playButton);
            item.appendChild(deleteButton);

            recordingsList.appendChild(item);
        });
    } catch (error) {
        console.error("Failed to load recordings:", error);
        recordingsList.innerHTML = "<p>Unable to load recordings.</p>";
    }
}

if (refreshRecordingsBtn) {
    refreshRecordingsBtn.addEventListener("click", loadRecordings);
}

if (openRecordingsFolderBtn) {
    openRecordingsFolderBtn.addEventListener("click", async () => {
        try {
            await window.screenStudio.openRecordingsFolder();
        } catch (error) {
            console.error(error);
            alert("Failed to open recordings folder.");
        }
    });
}

// ==================================
// PAGE NAVIGATION
// ==================================

const recorderNav = document.getElementById("recorderNav");
const settingsNav = document.getElementById("settingsNav");

const recorderPage = document.getElementById("recorderPage");
const recordingsPage = document.getElementById("recordingsPage");
const settingsPage = document.getElementById("settingsPage");

function showPage(pageName) {
    const pages = {
        recorder: recorderPage,
        recordings: recordingsPage,
        settings: settingsPage
    };

    Object.entries(pages).forEach(([name, page]) => {
        if (page) {
            page.hidden = !(name === pageName);
        }
    });

    const navButtons = {
        recorder: recorderNav,
        recordings: recordingsNav,
        settings: settingsNav
    };

    Object.entries(navButtons).forEach(([name, button]) => {
        if (button) {
            button.classList.toggle("active", name === pageName);
        }
    });

    if (pageName === "recordings") {
        loadRecordings();
    }
}

if (recorderNav) {
    recorderNav.addEventListener("click", () => showPage("recorder"));
}

if (recordingsNav) {
    recordingsNav.addEventListener("click", () => showPage("recordings"));
}

if (settingsNav) {
    settingsNav.addEventListener("click", () => showPage("settings"));
}

const sourceButtons = document.querySelectorAll(".source");

sourceButtons.forEach(button => {
    button.addEventListener("click", () => {
        const sourceType = button.dataset.source;

        if (sourceType === "screen") {
            sourceButtons.forEach(item => item.classList.remove("selected"));
            button.classList.add("selected");
            if (previewText) previewText.textContent = "Full screen selected";
            return;
        }

        if (sourceType === "window") {
            sourceButtons.forEach(item => item.classList.remove("selected"));
            button.classList.add("selected");
            if (previewText) previewText.textContent = "App window selected";
            return;
        }

        if (sourceType !== "area") return;

        selectedRecordingArea = null;
        sourceButtons.forEach(item => item.classList.remove("selected"));
        button.classList.add("selected");

        if (previewText) {
            previewText.textContent = "Custom area selected. Click Start recording to choose the area.";
        }
    });
});