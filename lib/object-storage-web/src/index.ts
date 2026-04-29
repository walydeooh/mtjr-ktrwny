// We only export useUpload from this lib for the project; ObjectUploader is
// kept in source for future use but not re-exported because its Uppy v5 types
// require strict React 19 type packages we don't currently have wired up.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — JS-resolved at runtime; types are too strict for our setup.
export { useUpload } from "./use-upload";
