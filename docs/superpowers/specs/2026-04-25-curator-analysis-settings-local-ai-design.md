# Curator Analysis Settings and Local AI Design

## Goal

Turn the current separate Smart distill button into configurable analysis behavior. The app should have one main action, Analyze archive, and the user should decide before analysis whether similar-photo review runs, which local AI mode is used, and how aggressively resources are used.

The feature should feel like a real control surface: presets for normal users, custom tuning for advanced users, and hardware-aware performance profiles similar in spirit to MiniFire.

## Current State

Curator currently has two separate paths:

- Standard analysis: scan, hash, exact duplicates, date resolution, misplaced files, zero-byte files, proposal building.
- Smart distillation: separate button that downloads local ONNX models, extracts image features, clusters similar photos, grades winners, and sends the user to the cluster review route.

The local AI stack is already present:

- CLIP ViT-B-32 ONNX for visual similarity embeddings.
- YuNet ONNX for face detection and face-quality hints.
- NIMA MobileNet ONNX for aesthetic scoring.
- ONNX Runtime CPU execution today, with models cached under the Curator local app data models directory.

## Product Model

There should be one analysis entry point:

1. User selects archive.
2. User adjusts Analysis Settings.
3. User runs Analyze archive.
4. Curator runs the configured pipeline.
5. Results show exact duplicates, cleanup findings, and similar-photo clusters when enabled.

The separate Smart distill CTA should be removed. The user-facing language should be Similar photo review, not Smart distill.

## Analysis Settings

Settings live beside the analysis controls, not hidden in a generic app settings page. The user should be able to see and change the settings before running analysis.

### Similar Photo Review

A primary toggle controls whether local-AI similar-photo clustering is part of analysis.

- Off: run only the existing analysis pipeline.
- On: run local-AI similar-photo feature extraction, clustering, and grading after the standard analysis steps.

The setting should be remembered between app sessions.

Default: Off for existing installs and first launch. Once the user enables it, preserve their choice.

### AI Mode

AI mode applies only when Similar Photo Review is on.

- AI Off: no ONNX model download or AI inference; similar-photo review is unavailable.
- Local AI Lite: run pHash, quality metrics, and CLIP similarity; skip heavier face and NIMA scoring.
- Local AI: run CLIP, face detection, NIMA, and quality scoring.

Cloud AI is out of scope for this implementation, but the settings model should not make it hard to add later.

### Presets

Presets define clustering strictness and scoring behavior.

- Safe: fewer clusters, high confidence, conservative quarantine suggestions.
- Balanced: default once enabled, practical recall without being noisy.
- Aggressive: catches more similar shots, expects more manual review.
- Custom: unlocks fine tuning.

Changing any individual tuning control switches the preset to Custom.

### Custom Tuning

Custom controls should include:

- pHash distance threshold.
- CLIP cosine threshold.
- EXIF time window.
- GPS distance window.
- Minimum cluster confidence.
- Sharpness weight.
- Exposure weight.
- Face quality weight.
- Aesthetic score weight.

Controls should use bounded ranges and plain labels. They should not expose raw implementation names unless the label explains the effect.

## Performance Settings

Performance settings define how much hardware Curator can use during analysis.

### Profiles

- Eco: low CPU worker count, no GPU, lower memory pressure. Safe while doing other work.
- Balanced: default. Uses several CPU workers, bounded memory, GPU only when stable and available.
- Max: higher worker count, GPU enabled when available, optimized for speed.
- Custom: manual worker count, GPU toggle, memory cap, and background throttle.

### Hardware Detection

Curator should detect:

- Logical CPU count.
- Total system memory.
- GPU availability relevant to ONNX Runtime.
- Whether DirectML can be used on this Windows system.

For Windows GPU acceleration, prefer ONNX Runtime DirectML as the first target because it can support NVIDIA, AMD, and Intel GPUs. CUDA-specific support can be added later if there is a measured reason.

### Resource Management

Analysis should use bounded queues rather than loading the archive into memory.

Pipeline stages:

- File scan and DB writes.
- Hashing and metadata extraction.
- Image decode and cheap quality metrics.
- Local AI inference.
- Clustering and grading.

Execution rules:

- CPU-bound work uses a configurable worker pool.
- AI inference uses a separate queue so model sessions are not multiplied recklessly.
- DB writes remain serialized or transaction-batched to avoid lock contention.
- Backpressure limits queued decoded images and embeddings.
- Background throttling reduces workers when the app loses focus or the system is under load.

## Architecture

### Settings Storage

Add a persisted analysis settings record. It can live in the Electron state/config layer rather than the archive DB because it is user preference, not archive data.

The stored object should include:

- similarPhotoReviewEnabled.
- aiMode.
- preset.
- custom thresholds and weights.
- performanceProfile.
- custom performance limits.

### IPC Surface

Add IPC methods:

- getAnalysisSettings.
- saveAnalysisSettings.
- detectHardwareProfile.
- runAnalysis with settings.

Existing smartDistill should become an internal analysis step rather than a primary renderer action.

### Python Sidecar

Extend existing feature extraction params to accept an AI mode and tuning values.

- Local AI Lite maps to skip face and NIMA scoring.
- Local AI uses all current models.
- Thresholds flow into clusterSmart and gradeClusters.

The Python APIs should remain deterministic and testable with explicit params rather than reading UI settings directly.

### Renderer

Dashboard should show a compact settings panel near Analyze archive.

Required controls:

- Similar Photo Review toggle.
- AI Mode segmented control.
- Preset segmented control.
- Performance profile segmented control.
- Custom tuning drawer or panel when Custom is selected.

The cluster review route remains the place where users inspect similar-photo clusters and choose winners.

## Error Handling

- If Similar Photo Review is on and models are missing, show model download progress as part of analysis.
- If model download fails, keep standard analysis results and show that similar-photo review failed.
- If GPU acceleration fails, fall back to CPU and record a plain-language warning.
- If an image cannot be decoded, record a skipped feature row and continue.
- If AI mode is Off, do not download models.

## Migration and Compatibility

- Existing users default to Similar Photo Review Off.
- Existing Smart distillation data tables remain valid.
- Existing cluster review and undo behavior remain valid.
- Removing the separate Smart distill button must not remove the cluster review route.

## Testing

Add tests for:

- Default settings load.
- Settings persistence.
- Preset to concrete threshold mapping.
- Custom tuning switches preset to Custom.
- Analyze archive calls the similar-photo pipeline only when enabled.
- AI Off does not call downloadModels.
- Local AI Lite skips face and NIMA extraction.
- Performance profile maps to worker counts and memory caps.
- GPU failure falls back to CPU without failing the full analysis.
- Renderer shows settings controls before analysis and no separate Smart distill CTA.

## Non-Goals

- No cloud AI provider integration in this pass.
- No automatic deletion. Similar-photo losers still go through review and quarantine.
- No CUDA-specific optimization unless DirectML proves insufficient in a later measured pass.
- No broad redesign of unrelated settings.

## Rollout

Implement in small slices:

1. Persisted analysis settings and UI controls.
2. Merge Smart distillation into Analyze archive behind the Similar Photo Review toggle.
3. Preset and custom threshold plumbing into sidecar params.
4. Performance profiles and hardware detection.
5. DirectML/GPU acceleration with CPU fallback.

Each slice should preserve the existing exact-duplicate workflow.