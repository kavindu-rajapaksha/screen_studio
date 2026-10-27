const timerElement = document.getElementById("timer");
const toolbarElement = document.getElementById("toolbar");
const pauseButton = document.getElementById("pauseButton");
const stopButton = document.getElementById("stopButton");

let isPaused = false;

pauseButton.addEventListener("click", async () => {
    if (isPaused) {
        await window.recordingToolbar.resumeRecording();
    } else {
        await window.recordingToolbar.pauseRecording();
    }
});

stopButton.addEventListener("click", async () => {
    stopButton.disabled = true;
    stopButton.textContent = "Stopping...";

    try {
        await window.recordingToolbar.stopRecording();
    } catch (error) {
        console.error("Failed to stop recording:", error);

        stopButton.disabled = false;
        stopButton.textContent = "Stop";
    }
});

window.recordingToolbar.onTimerUpdate((data) => {
    pauseButton.disabled = false;
    stopButton.disabled = false;

    if (data.time) {
        timerElement.textContent = data.time;
    }

    if (typeof data.paused === "boolean") {
        isPaused = data.paused;

        pauseButton.textContent = isPaused ? "Resume" : "Pause";

        toolbarElement.classList.toggle("paused", isPaused);
    }
});

window.recordingToolbar.onRecordingStopped(() => {
    stopButton.disabled = true;
    pauseButton.disabled = true;
    stopButton.textContent = "Saving...";
});