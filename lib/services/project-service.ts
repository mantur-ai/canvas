"use server";

// Server Action facade kept for existing imports from routes and client components.
import * as canvasService from "@/lib/services/project/canvas-service";
import * as imageService from "@/lib/services/project/image-service";
import * as lifecycleService from "@/lib/services/project/project-service";
import * as tempFileService from "@/lib/services/project/temp-file-service";
import * as videoService from "@/lib/services/project/video-service";

export async function getProjectCanvasData(
  params: Parameters<typeof canvasService.getProjectCanvasData>[0],
) {
  return canvasService.getProjectCanvasData(params);
}

export async function getProjectFlow(projectId: string) {
  return canvasService.getProjectFlow(projectId);
}

export async function normalizeProjectStoryboardAssets(
  params: Parameters<typeof canvasService.normalizeProjectStoryboardAssets>[0],
) {
  return canvasService.normalizeProjectStoryboardAssets(params);
}

export async function saveProjectFlow(params: Parameters<typeof canvasService.saveProjectFlow>[0]) {
  return canvasService.saveProjectFlow(params);
}

export async function saveProjectEpisodeStoryboards(
  params: Parameters<typeof canvasService.saveProjectEpisodeStoryboards>[0],
) {
  return canvasService.saveProjectEpisodeStoryboards(params);
}

export async function getProjectConfig(projectId: string) {
  return canvasService.getProjectConfig(projectId);
}

export async function saveProjectConfig(params: Parameters<typeof canvasService.saveProjectConfig>[0]) {
  return canvasService.saveProjectConfig(params);
}

export async function getProjectImages(projectId: string) {
  return imageService.getProjectImages(projectId);
}

export async function deleteProjectImage(params: Parameters<typeof imageService.deleteProjectImage>[0]) {
  return imageService.deleteProjectImage(params);
}

export async function replaceProjectImages(
  params: Parameters<typeof imageService.replaceProjectImages>[0],
) {
  return imageService.replaceProjectImages(params);
}

export async function createProjectImage(params: Parameters<typeof imageService.createProjectImage>[0]) {
  return imageService.createProjectImage(params);
}

export async function updateProjectImageFile(
  params: Parameters<typeof imageService.updateProjectImageFile>[0],
) {
  return imageService.updateProjectImageFile(params);
}

export async function clearProjectImageFile(
  params: Parameters<typeof imageService.clearProjectImageFile>[0],
) {
  return imageService.clearProjectImageFile(params);
}

export async function storeGeneratedProjectImage(
  params: Parameters<typeof imageService.storeGeneratedProjectImage>[0],
) {
  return imageService.storeGeneratedProjectImage(params);
}

export async function storeProjectImagePublicUrl(
  params: Parameters<typeof imageService.storeProjectImagePublicUrl>[0],
) {
  return imageService.storeProjectImagePublicUrl(params);
}

export async function resolveProjectImagePublicUrl(
  params: Parameters<typeof imageService.resolveProjectImagePublicUrl>[0],
) {
  return imageService.resolveProjectImagePublicUrl(params);
}

export async function addProjectImageToStoryboard(
  params: Parameters<typeof imageService.addProjectImageToStoryboard>[0],
) {
  return imageService.addProjectImageToStoryboard(params);
}

export async function addExistingImageToProjectAssets(
  params: Parameters<typeof imageService.addExistingImageToProjectAssets>[0],
) {
  return imageService.addExistingImageToProjectAssets(params);
}

export async function readProjectImageFile(params: Parameters<typeof imageService.readProjectImageFile>[0]) {
  return imageService.readProjectImageFile(params);
}

export async function listProjects() {
  return lifecycleService.listProjects();
}

export async function getCurrentProject() {
  return lifecycleService.getCurrentProject();
}

export async function setCurrentProject(projectId: string) {
  return lifecycleService.setCurrentProject(projectId);
}

export async function clearCurrentProject() {
  return lifecycleService.clearCurrentProject();
}

export async function getProject(projectId: string) {
  return lifecycleService.getProject(projectId);
}

export async function updateProject(params: Parameters<typeof lifecycleService.updateProject>[0]) {
  return lifecycleService.updateProject(params);
}

export async function deleteProject(projectId: string) {
  return lifecycleService.deleteProject(projectId);
}

export async function createProject(params: Parameters<typeof lifecycleService.createProject>[0]) {
  return lifecycleService.createProject(params);
}

export async function saveProjectTempImages(
  params: Parameters<typeof tempFileService.saveProjectTempImages>[0],
) {
  return tempFileService.saveProjectTempImages(params);
}

export async function saveProjectTempFiles(params: Parameters<typeof tempFileService.saveProjectTempFiles>[0]) {
  return tempFileService.saveProjectTempFiles(params);
}

export async function readProjectTempImage(params: Parameters<typeof tempFileService.readProjectTempImage>[0]) {
  return tempFileService.readProjectTempImage(params);
}

export async function createProjectSkillContext(
  params: Parameters<typeof tempFileService.createProjectSkillContext>[0],
) {
  return tempFileService.createProjectSkillContext(params);
}

export async function deleteProjectSkillContext(
  params: Parameters<typeof tempFileService.deleteProjectSkillContext>[0],
) {
  return tempFileService.deleteProjectSkillContext(params);
}

export async function getProjectVideos(projectId: string) {
  return videoService.getProjectVideos(projectId);
}

export async function createProjectVideo(params: Parameters<typeof videoService.createProjectVideo>[0]) {
  return videoService.createProjectVideo(params);
}

export async function updateProjectVideoFile(
  params: Parameters<typeof videoService.updateProjectVideoFile>[0],
) {
  return videoService.updateProjectVideoFile(params);
}

export async function storeGeneratedProjectVideo(
  params: Parameters<typeof videoService.storeGeneratedProjectVideo>[0],
) {
  return videoService.storeGeneratedProjectVideo(params);
}

export async function addProjectVideoToStoryboard(
  params: Parameters<typeof videoService.addProjectVideoToStoryboard>[0],
) {
  return videoService.addProjectVideoToStoryboard(params);
}

export async function setProjectStoryboardSelectedVideo(
  params: Parameters<typeof videoService.setProjectStoryboardSelectedVideo>[0],
) {
  return videoService.setProjectStoryboardSelectedVideo(params);
}

export async function clearProjectStoryboardSelectedVideo(
  params: Parameters<typeof videoService.clearProjectStoryboardSelectedVideo>[0],
) {
  return videoService.clearProjectStoryboardSelectedVideo(params);
}

export async function deleteProjectVideo(params: Parameters<typeof videoService.deleteProjectVideo>[0]) {
  return videoService.deleteProjectVideo(params);
}

export async function mergeProjectVideos(params: Parameters<typeof videoService.mergeProjectVideos>[0]) {
  return videoService.mergeProjectVideos(params);
}

export async function readProjectVideoFile(params: Parameters<typeof videoService.readProjectVideoFile>[0]) {
  return videoService.readProjectVideoFile(params);
}
