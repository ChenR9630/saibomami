const statusNode = document.querySelector("#desktopStatus");

async function runMasterCatTest() {
  if (!window.twin3D) {
    statusNode.textContent = "3D 渲染器未初始化";
    statusNode.classList.add("is-offline");
    return;
  }
  try {
    const response = await fetch("/api/twin/3d/master", { cache: "no-store" });
    const master = await response.json();
    if (!master.modelUrl) {
      throw new Error("MASTER_CAT_MODEL_MISSING");
    }
    const params = new URLSearchParams(location.search);
    let animations = {};
    if (params.get("animations") === "current") {
      const twinResponse = await fetch("/api/twin/3d", { cache: "no-store" });
      const twin = await twinResponse.json();
      animations = twin.animations || {};
    }
    await window.twin3D.loadModel(master.modelUrl, animations);
    const action = params.get("action") || "idle";
    window.twin3D.setAction(action);
    window.twin3D.setScale(1);
    statusNode.textContent = params.get("animations") === "current"
      ? `母版骨架已加载 · 已尝试当前动作库 · ${master.runtimeExport?.armatures?.[0] || "rig"}`
      : `母版骨架已加载 · ${master.id} · ${master.runtimeExport?.armatures?.[0] || "rig"}`;
    window.masterCatTestResult = {
      ok: true,
      master,
      hasModel: document.querySelector("#desktopStage")?.classList.contains("has-3d-model"),
    };
  } catch (error) {
    statusNode.textContent = `母版骨架加载失败 · ${error.message}`;
    statusNode.classList.add("is-offline");
    window.masterCatTestResult = {
      ok: false,
      error: error.message,
    };
  }
}

window.addEventListener("twin3dready", runMasterCatTest);
runMasterCatTest();
