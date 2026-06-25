const fs = require("node:fs");

const masterCatRetargetMap = {
  root: "root",
  pelvis: "DEF-pelvis.C",
  body_bot: "DEF-spine",
  body: "DEF-spine.002",
  body_top0: "DEF-spine.004",
  body_top1: "DEF-spine.006",
  neck0: "neck",
  neck1: "head",
  head0: "head",
  tail0: "DEF-tail.001",
  tail1: "DEF-tail.001",
  tail2: "DEF-tail.002",
  tail3: "DEF-tail.002",
  tail4: "DEF-tail.003",
  tail5: "DEF-tail.004",
  tail6: "DEF-tail.004",
  leg_hind_left_top0: "DEF-thigh.L",
  leg_hind_left_top1: "DEF-thigh.L.001",
  leg_hind_left_bot0: "DEF-shin.L",
  leg_hind_left_ankle: "DEF-foot.L",
  leg_hind_left_toe: "DEF-r_toe.L",
  leg_hind_right_top0: "DEF-thigh.R",
  leg_hind_right_top1: "DEF-thigh.R.001",
  leg_hind_right_bot0: "DEF-shin.R",
  leg_hind_right_ankle: "DEF-foot.R",
  leg_hind_right_toe: "DEF-r_toe.R",
  leg_front_left_top0: "DEF-upper_arm.L",
  leg_front_left_top1: "DEF-upper_arm.L.001",
  leg_front_left_bot0: "DEF-forearm.L",
  leg_front_left_ankle: "DEF-hand.L",
  leg_front_left_toe: "DEF-f_toe.L",
  leg_front_right_top0: "DEF-upper_arm.R",
  leg_front_right_top1: "DEF-upper_arm.R.001",
  leg_front_right_bot0: "DEF-forearm.R",
  leg_front_right_ankle: "DEF-hand.R",
  leg_front_right_toe: "DEF-f_toe.R",
};

function readGlbJson(filePath) {
  const buffer = fs.readFileSync(filePath);
  if (buffer.subarray(0, 4).toString("ascii") !== "glTF") {
    throw new Error(`${filePath} is not GLB`);
  }
  const jsonLength = buffer.readUInt32LE(12);
  return JSON.parse(buffer.subarray(20, 20 + jsonLength).toString("utf8"));
}

function animationTracks(gltf) {
  const nodes = gltf.nodes || [];
  return (gltf.animations || []).flatMap((animation) => (
    (animation.channels || []).map((channel) => {
      const target = channel.target || {};
      return {
        animation: animation.name || "",
        node: nodes[target.node]?.name || "",
        path: target.path || "",
      };
    })
  ));
}

function main() {
  const master = readGlbJson("assets/master-cat/master-cat.glb");
  const masterNames = new Set((master.nodes || []).map((node) => node.name).filter(Boolean));
  const animationFiles = process.argv.slice(2);
  const report = animationFiles.map((filePath) => {
    const tracks = animationTracks(readGlbJson(filePath));
    const mapped = tracks
      .map((track) => ({
        ...track,
        target: masterCatRetargetMap[track.node] || "",
      }))
      .filter((track) => track.target);
    const valid = mapped.filter((track) => masterNames.has(track.target));
    const runtimeTracks = valid.filter((track) => (
      track.path === "rotation"
      || (track.node === "root" && track.path === "translation")
    ));
    return {
      file: filePath,
      totalTracks: tracks.length,
      mappedTracks: mapped.length,
      validMappedTracks: valid.length,
      runtimeTracks: runtimeTracks.length,
      missingTargets: [...new Set(mapped
        .filter((track) => !masterNames.has(track.target))
        .map((track) => track.target))],
      unmappedSourceNodes: [...new Set(tracks
        .filter((track) => !masterCatRetargetMap[track.node])
        .map((track) => track.node))]
        .filter(Boolean),
      sampleRuntimeTracks: runtimeTracks.slice(0, 30).map((track) => (
        `${track.node}.${track.path} -> ${track.target}.${track.path}`
      )),
    };
  });
  console.log(JSON.stringify(report, null, 2));
}

main();
