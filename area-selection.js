const selection = document.getElementById("selection");
const instructions = document.getElementById("instructions");
const actions = document.getElementById("actions");
const confirmButton = document.getElementById("confirm");
const cancelButton = document.getElementById("cancel");

let startX = 0;
let startY = 0;
let endX = 0;
let endY = 0;
let isSelecting = false;

document.addEventListener("mousedown", (event) => {
    // Don't start a new selection when clicking the confirmation buttons.
    if (event.button !== 0 || event.target.closest("#actions")) {
        return;
    }

    startX = event.clientX;
    startY = event.clientY;
    isSelecting = true;

    selection.style.left = `${startX}px`;
    selection.style.top = `${startY}px`;
    selection.style.width = "0px";
    selection.style.height = "0px";
    selection.style.display = "block";

    actions.style.display = "none";
});

document.addEventListener("mousemove", (event) => {
    if (!isSelecting) return;

    endX = event.clientX;
    endY = event.clientY;

    selection.style.left = `${Math.min(startX, endX)}px`;
    selection.style.top = `${Math.min(startY, endY)}px`;
    selection.style.width = `${Math.abs(endX - startX)}px`;
    selection.style.height = `${Math.abs(endY - startY)}px`;
});

document.addEventListener("mouseup", (event) => {
    if (!isSelecting) return;

    isSelecting = false;
    endX = event.clientX;
    endY = event.clientY;

    const width = Math.abs(endX - startX);
    const height = Math.abs(endY - startY);

    if (width < 20 || height < 20) {
        selection.style.display = "none";
        instructions.textContent = "Drag to select a larger recording area";
        return;
    }

    instructions.textContent =
        `${Math.round(width)} × ${Math.round(height)} selected`;
    actions.style.display = "flex";
});

confirmButton.addEventListener("click", () => {
    const rect = {
        x: Math.round(Math.min(startX, endX)),
        y: Math.round(Math.min(startY, endY)),
        width: Math.round(Math.abs(endX - startX)),
        height: Math.round(Math.abs(endY - startY)),
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight
    };

    if (rect.width < 20 || rect.height < 20) {
        instructions.textContent = "Please select a larger area.";
        return;
    }

    if (!window.areaSelection) {
        instructions.textContent = "Area selection connection failed.";
        console.error("window.areaSelection is unavailable.");
        return;
    }

    window.areaSelection.confirm(rect);
});

cancelButton.addEventListener("click", () => {
    window.areaSelection.cancel();
});