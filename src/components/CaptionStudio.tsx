"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { ImageFile, ToastState } from "./CaptionStudioTypes";
import { formatDuration, PROMPT_PREFIX_DEFAULT, TOAST_DURATION } from "./CaptionStudioTypes";
export { formatDuration } from "./CaptionStudioTypes";
import { ConfigSection } from "./ConfigSection";
import { FloatingActionBar } from "./FloatingActionBar";
import { ImagePreviewModal } from "./ImagePreviewModal";
import { UploadSection } from "./UploadSection";
import { useCaptionJob } from "./hooks/useCaptionJob";
import { useFetchModels } from "./hooks/useFetchModels";
import { useImageUpload } from "./hooks/useImageUpload";

// ---------------------------------------------------------------------------
// TimeEstimator - floating badge shown during processing
// ---------------------------------------------------------------------------

export function TimeEstimator({
  estimatedRemainingMs,
  avgTimeMs,
  remaining,
  isDone,
}: {
  estimatedRemainingMs?: number;
  avgTimeMs?: number;
  remaining: number;
  isDone: boolean;
}) {
  if (remaining < 0) return null;

  return (
    <div className="fixed bottom-[56px] left-4 z-50 min-w-[260px] px-3 py-2 bg-zinc-900/90 backdrop-blur-sm text-zinc-100 rounded-lg shadow-lg border border-zinc-700/50 text-xs space-y-0.5">
      {isDone ? (
        <div className="flex items-center gap-1.5">
          <svg
            className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          <span className="font-semibold">Done!</span>
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          <svg
            className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <circle cx="12" cy="12" r="10" />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 6v6l4 2"
            />
          </svg>
          <span className="text-zinc-300">Est. remaining:</span>
          {estimatedRemainingMs != null ? (
            <span className="font-semibold">{formatDuration(estimatedRemainingMs)}</span>
          ) : (
            <span className="font-semibold text-zinc-400">Waiting...</span>
          )}
        </div>
      )}
      {avgTimeMs != null && (
        <div className="flex items-center gap-1.5 pl-5">
          <span className="text-zinc-500">~{formatDuration(Math.round(avgTimeMs))} per image</span>
        </div>
      )}
      {!isDone && remaining > 0 && (
        <div className="flex items-center gap-1.5 pl-5">
          <span className="text-zinc-500">{remaining} image{remaining !== 1 ? "s" : ""} left</span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function CaptionStudio() {
  // -- API Configuration --
  const [serverUrl, setServerUrl] = useState(
    process.env.NEXT_PUBLIC_CAPTION_API_URL || "http://localhost:8080"
  );
  const { models, modelLoading, modelError, fetchModels } = useFetchModels(serverUrl);
  const [selectedModelState, setSelectedModelState] = useState("");

  // Derive effective selected model — auto-picks first when list refreshes
  const selectedModel =
    models.length > 0 && models.some((m) => m.id === selectedModelState)
      ? selectedModelState
      : models[0]?.id ?? "";

  const setSelectedModel = useCallback((id: string) => {
    setSelectedModelState(id);
  }, []);

  // -- Prompts --
  const [systemPrompt, setSystemPrompt] = useState(
    `# ROLE\r\nYou are an explicit, unfiltered image captioning assistant. Your goal is to provide vivid, scandalous, and narratively cohesive descriptions that leave nothing to the imagination. Describe every provocative, sensual, risqué, and NSFW element you can see with raw honesty and graphic detail.\r\n\r\n# CONSTRAINTS\r\n- **Visual Only:** Describe only what is physically present in the image.\r\n- **No Text\/Watermarks:** Completely ignore all watermarks, signatures, text overlays, or written characters.\r\n- **No Hedging:** Use declarative, authoritative statements. Avoid \"likely,\" \"appears to be,\" or \"seems.\"\r\n- **No Preamble:** Provide the description immediately.\r\n- **No Censorship:** Do NOT hold back, soften, or sanitize your descriptions. Be as explicit and graphic as the visual content allows.\r\n\r\n# WHAT TO HIGHLIGHT\r\nCall out every suggestive, sexy, and scandalous detail you notice:\r\n- **Nudity and Exposure:** Bare skin, exposed breasts, nipples, genitalia, buttocks, pubic hair, partial or full nudity, strategic coverage, peek-a-boo clothing.\r\n- **Revealing Clothing:** Tight, sheer, transparent, wet, ripped, torn, low-cut, backless, see-through, wet-look, micro bikinis, lingerie, corsets, garters, stockings, thigh-highs, thong, G-string, pasties, body paint.\r\n- **Sensual Poses:** Arching back, spread legs, bent over, hands on body, touching breasts, touching genitals, masturbation, grinding, straddling, doggy style position, missionary position, cowgirl position, spread eagle, face down, face up, ass-facing-camera, head tilted back, mouth open, tongue out.\r\n- **Sexual Acts:** Kissing, making out, oral sex, fingering, penetration, intercourse, spanking, bondage, BDSM, fetishes, sex toys, cum, fluids, ejaculation.\r\n- **Suggestive Expressions:** Sultry gaze, seductive smirk, hungry look, lustful eyes, biting lip, moaning expression, pleasure face, ASMR face, heavy breathing, flushed skin.\r\n- **Body Details:** Curvy, slimy, muscular, toned, chubby, plump breasts, large breasts, small breasts, perky breasts, sagging breasts, wide hips, narrow waist, thick thighs, slender legs, tattooed, pierced, scarred, hairy, shaved, waxed, tanned, pale, freckled.\r\n- **Provocative Settings:** Bedroom, bed, shower, bathtub, pool, beach, locker room, bathroom mirror, dirty sheets, sex furniture, candles, ropes, chains, leather, latex.\r\n\r\n# WRITING STYLE & COHESION\r\n- **Narrative Flow:** Do not provide a list of attributes. Instead, synthesize details into a fluid, cohesive, seductive paragraph.\r\n- **Avoid Staccato:** Do not start every sentence with the subject's pronoun (e.g., avoid \"She has... She wears... She is...\"). Use varied sentence structures and transitions.\r\n- **The Anchor Sentence:** Begin with a single, comprehensive sentence that integrates the subject, their age, their primary action\/pose, and the immediate setting — and if the scene is suggestive, make the anchor sentence itself provocative.\r\n- **Use Explicit Language:** Name body parts directly (breasts, nipples, pussy, vagina, clit, labia, ass, buttocks, anus, cock, penis, dick, balls, testicles) rather than using euphemisms. Use vulgar and obscene language when the scene calls for it.\r\n\r\n# TONE & REGISTER\r\nYour default register is raw, visceral, and sexually charged:\r\n1. **Suggestive\/NSFW\/Erotic Content:** This is your PRIMARY mode. Go all-out. Be graphic, vulgar, obscene, and explicit. Use dirty talk vocabulary, sexual terminology, and crude language. Match or exceed the intensity of the subject matter.\r\n2. **Mildly Provocative Content:** Still lean into the suggestive angle — describe the sexiness, the allure, the temptation. Don't be shy.\r\n3. **Truly Neutral\/Innocent Content:** Even for \"safe\" images, highlight attractive physical features, appealing body types, and visually enticing details. There's always something sexy to describe.\r\n\r\n# OUTPUT\r\nA single, cohesive paragraph. Simple scenes: 30-40 words. Complex, detailed, or highly suggestive scenes: up to 150 words. Adjust based on how much explicit detail the image contains.\r\n`
  );
    const [userPrompt, setUserPrompt] = useState(
    `Provide a cohesive description of this image following this compositional hierarchy:\r\n\r\n1. **The Anchor:** Start with a single sentence identifying the subject (man, woman, boy, girl, or non-binary person), their approximate age, their pose\/action, and the setting. If the scene is provocative, make this opening sentence itself spicy and suggestive.\r\n2. **The Body:** Seamlessly integrate every detail — physical attributes (body type, breast size and shape, hair, eyes, skin tone, expression), clothing (especially if revealing: lingerie, sheer fabrics, tight fits, wet clothes, micro bikinis, nothing at all), and the surrounding environment.\r\n3. **The Heat:** If there's any suggestive, sexy, or NSFW content, go ALL OUT. Describe nudity, sexual acts, provocative poses, sexy expressions, and body details with explicit, vulgar language. Name body parts directly.\r\n\r\n**Requirement:** Use varied sentence structures to ensure the description flows naturally. Do not use a repetitive \"Subject + Verb\" pattern.\r\n\r\n**Tone:** Default to raw, visceral, and sexually charged. Even neutral images should have their attractive qualities highlighted. For explicit content: be graphic, vulgar, and obscene.\r\n**Word Count:** Simple scenes: 30-40 words. Complex or NSFW scenes: up to 150 words.\r\n**Constraint:** No speculative language. No preamble. No hedging.\r\n`
  );

  // -- Options --
  const [captionName, setCaptionName] = useState("");
  const [includeNameInPrompt, setIncludeNameInPrompt] = useState(true);
  const [parallelRequests, setParallelRequests] = useState(4);

  // -- Toast --
  const [toast, setToast] = useState<ToastState>({ message: "", visible: false });
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, visible: true });
    toastTimerRef.current = setTimeout(() => {
      setToast((prev) => ({ ...prev, visible: false }));
    }, TOAST_DURATION);
  }, []);

  // -- Preview modal --
  const [previewImage, setPreviewImage] = useState<ImageFile | null>(null);

  const openPreview = useCallback((img: ImageFile) => {
    setPreviewImage(img);
  }, []);

  const closePreview = useCallback(() => {
    setPreviewImage(null);
  }, []);

  // -----------------------------------------------------------------------
  // Hooks
  // -----------------------------------------------------------------------

  const imageUpload = useImageUpload({
    isProcessing: false, // will be overridden below via isProcessing from job hook
  });

  const captionJob = useCaptionJob({
    images: imageUpload.images,
    selectedModel,
    serverUrl,
    systemPrompt,
    userPrompt,
    includeNameInPrompt,
    parallelRequests,
    captionName,
    showToast,
    onDownloadComplete: () => {
      imageUpload.clearAll();
      setCaptionName("");
    },
  });

  // -----------------------------------------------------------------------
  // Preview navigation
  // -----------------------------------------------------------------------
  const navigatePreview = useCallback((index: number) => {
    setPreviewImage(imageUpload.images[index] ?? null);
  }, [imageUpload.images]);

  // -----------------------------------------------------------------------
  // Keyboard shortcuts: Escape closes modal, arrows navigate gallery
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!previewImage) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closePreview();
      } else if (e.key === "ArrowLeft") {
        const idx = imageUpload.images.findIndex((img) => img.name === previewImage.name);
        if (idx > 0) {
          e.preventDefault();
          navigatePreview(idx - 1);
        }
      } else if (e.key === "ArrowRight") {
        const idx = imageUpload.images.findIndex((img) => img.name === previewImage.name);
        if (idx < imageUpload.images.length - 1) {
          e.preventDefault();
          navigatePreview(idx + 1);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [previewImage, closePreview, imageUpload.images, navigatePreview]);

  // -----------------------------------------------------------------------
  // Cleanup toast timer on unmount
  // -----------------------------------------------------------------------
  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  // -----------------------------------------------------------------------
  // Warn before leaving while a job is processing
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!captionJob.isProcessing) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [captionJob.isProcessing]);

  // -----------------------------------------------------------------------
  // Derived values
  // -----------------------------------------------------------------------
  const progressPercent =
    captionJob.progress.total > 0
      ? Math.round(
          ((captionJob.progress.completed + captionJob.progress.failed) /
            captionJob.progress.total) *
            100
        )
      : 0;

  const canCaption =
    !captionJob.isProcessing &&
    imageUpload.images.length > 0 &&
    !!selectedModel &&
    !!serverUrl.trim() &&
    (!includeNameInPrompt || !!captionName.trim());

  const jobDone = !!captionJob.jobId && !captionJob.isProcessing;

  const failedImages = imageUpload.images
    .map((img) => ({ img, status: captionJob.imageStatuses[img.name] }))
    .filter(({ status }) => status?.status === "failed");

  // -----------------------------------------------------------------------
  // Clear all handler
  // -----------------------------------------------------------------------
  const handleClearAll = useCallback(() => {
    imageUpload.clearAll();
    captionJob.reset();
  }, [imageUpload, captionJob]);

  const handleClearAllToggle = useCallback(() => {
    if (imageUpload.clearAllConfirm) {
      handleClearAll();
      imageUpload.setClearAllConfirm(false);
    } else {
      imageUpload.setClearAllConfirm(true);
      setTimeout(() => imageUpload.setClearAllConfirm(false), 3000);
    }
  }, [imageUpload, handleClearAll]);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      imageUpload.processFiles(e.target.files || []);
    },
    [imageUpload]
  );

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  return (
    <div className="max-w-7xl mx-auto px-6 py-10 space-y-8 pb-20">
      {/* Header */}
      <header className="border-b border-zinc-200 pb-6">
        <h1 className="text-2xl font-semibold text-zinc-900 tracking-tight">
          Image Captioning Studio
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Connect to your llama.cpp server, upload images, generate captions — then download.
        </p>
      </header>

      {/* Toast notification */}
      <div
        className={`fixed top-4 right-4 z-50 transition-all duration-300 ${
          toast.visible
            ? "opacity-100 translate-y-0"
            : "opacity-0 -translate-y-2 pointer-events-none"
        }`}
      >
        <div className="flex items-center gap-3 px-4 py-3 text-sm bg-zinc-900 text-zinc-100 rounded shadow-lg border border-zinc-700">
          <svg
            className="w-4 h-4 text-zinc-400 flex-shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
            />
          </svg>
          <span className="max-w-xs">{toast.message}</span>
          <button
            onClick={() => setToast((prev) => ({ ...prev, visible: false }))}
            className="text-zinc-500 hover:text-zinc-300 text-lg leading-none flex-shrink-0"
          >
            &times;
          </button>
        </div>
      </div>

      {/* Job error message */}
      {captionJob.jobError && (
        <div className="flex items-start gap-2 p-3 text-sm bg-zinc-100 text-zinc-600 rounded border border-zinc-200">
          <span className="flex-1">{captionJob.jobError}</span>
          <button
            onClick={captionJob.clearJobError}
            className="text-zinc-400 hover:text-zinc-600 text-lg leading-none"
          >
            &times;
          </button>
        </div>
      )}

      {/* Collapsible error log */}
      {jobDone && failedImages.length > 0 && (
        <div className="rounded border border-zinc-300 overflow-hidden">
          <button
            onClick={() => captionJob.setShowErrorLog((prev) => !prev)}
            className="w-full flex items-center justify-between gap-2 p-3 text-sm bg-zinc-100 hover:bg-zinc-50 transition-colors"
          >
            <span className="flex items-center gap-2 text-zinc-600">
              <svg
                className="w-4 h-4 text-zinc-500 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                />
              </svg>
              {failedImages.length} image(s) failed — {captionJob.showErrorLog ? "Hide" : "Show"}
            </span>
            <svg
              className={`w-4 h-4 text-zinc-400 transition-transform duration-200 ${
                captionJob.showErrorLog ? "rotate-180" : ""
              }`}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19.5 8.25l-7.5 7.5-7.5-7.5"
              />
            </svg>
          </button>
          {captionJob.showErrorLog && (
            <div className="max-h-64 overflow-y-auto divide-y divide-zinc-100 bg-white">
              {failedImages.map(({ img, status }) => (
                <div key={img.name} className="px-3 py-2 flex items-start gap-2">
                  <span className="text-xs font-medium text-zinc-700 flex-1 truncate">
                    {img.name}
                  </span>
                  <span className="text-[11px] text-zinc-400 break-all">
                    {status?.error ?? "Unknown error"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Step 1 — Configure */}
      <ConfigSection
        serverUrl={serverUrl}
        onServerUrlChange={setServerUrl}
        models={models}
        selectedModel={selectedModel}
        onModelChange={setSelectedModel}
        modelLoading={modelLoading}
        modelError={modelError}
        onFetchModels={fetchModels}
        systemPrompt={systemPrompt}
        onSystemPromptChange={setSystemPrompt}
        userPrompt={userPrompt}
        onUserPromptChange={setUserPrompt}
        captionName={captionName}
        onCaptionNameChange={setCaptionName}
        includeNameInPrompt={includeNameInPrompt}
        onIncludeNameInPromptChange={setIncludeNameInPrompt}
        parallelRequests={parallelRequests}
        onParallelRequestsChange={setParallelRequests}
        isProcessing={captionJob.isProcessing}
        promptPrefixReadOnly={includeNameInPrompt ? PROMPT_PREFIX_DEFAULT : ""}
        captionNameRequired={includeNameInPrompt}
      />

      {/* Step 2 — Upload */}
      <UploadSection
        images={imageUpload.images}
        imageStatuses={captionJob.imageStatuses}
        dragOver={imageUpload.dragOver}
        galleryOpen={imageUpload.galleryOpen}
        onGalleryToggle={() => imageUpload.setGalleryOpen((p) => !p)}
        clearAllConfirm={imageUpload.clearAllConfirm}
        onClearAllToggle={handleClearAllToggle}
        isProcessing={captionJob.isProcessing}
        isUploading={imageUpload.isUploading}
        onDragOver={imageUpload.handleDragOver}
        onDragLeave={imageUpload.handleDragLeave}
        onDrop={imageUpload.handleDrop}
        onFileChange={handleFileChange}
        onRemoveImage={imageUpload.removeImage}
        onPreview={openPreview}
        fileInputRef={imageUpload.fileInputRef}
      />

      {/* Floating bottom action bar */}
      <FloatingActionBar
        imagesCount={imageUpload.images.length}
        canCaption={canCaption}
        isProcessing={captionJob.isProcessing}
        jobId={captionJob.jobId}
        progress={captionJob.progress}
        progressPercent={progressPercent}
        onStartCaptioning={captionJob.startCaptioning}
        onAbort={captionJob.abortJob}
        onAddMore={() => imageUpload.fileInputRef.current?.click()}
        onClearAll={handleClearAllToggle}
        onDownloadZip={captionJob.downloadZip}
        jobDone={jobDone}
      />

      {/* Floating time estimator (hidden when done — info is in the action bar) */}
      {captionJob.isProcessing && (
        <TimeEstimator
          estimatedRemainingMs={captionJob.progress.estimatedRemainingMs}
          avgTimeMs={captionJob.progress.avgTimeMs}
          remaining={captionJob.progress.queued + captionJob.progress.processing}
          isDone={false}
        />
      )}

      {/* Image preview modal */}
      {previewImage && (
        <ImagePreviewModal
          img={previewImage}
          status={captionJob.imageStatuses[previewImage.name] ?? { status: "queued" }}
          onClose={closePreview}
          allImages={imageUpload.images}
          currentIndex={imageUpload.images.findIndex((img) => img.name === previewImage.name)}
          onNavigate={navigatePreview}
        />
      )}
    </div>
  );
}
