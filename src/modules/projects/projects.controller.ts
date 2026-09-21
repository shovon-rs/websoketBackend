import { Request, Response } from 'express';
import * as projectsService from './projects.service';
import {
  AddProjectMemberInput,
  CreateProjectInput,
  CreateSectionInput,
  UpdateProjectInput,
  UpdateProjectMemberRoleInput,
  UpdateSectionInput,
} from './projects.schemas';

export async function listProjects(req: Request, res: Response): Promise<void> {
  const projects = await projectsService.listProjects(req.user!);
  res.json({ projects });
}

export async function createProject(req: Request<unknown, unknown, CreateProjectInput>, res: Response): Promise<void> {
  const project = await projectsService.createProject(req.user!, req.body);
  res.status(201).json(project);
}

export async function getProject(req: Request<{ id: string }>, res: Response): Promise<void> {
  await projectsService.assertCanViewProject(req.params.id, req.user!);
  const project = await projectsService.getProject(req.params.id);
  res.json(project);
}

export async function updateProject(req: Request<{ id: string }, unknown, UpdateProjectInput>, res: Response): Promise<void> {
  await projectsService.assertProjectAdmin(req.params.id, req.user!);
  const project = await projectsService.updateProject(req.params.id, req.body);
  res.json(project);
}

export async function deleteProject(req: Request<{ id: string }>, res: Response): Promise<void> {
  await projectsService.assertProjectAdmin(req.params.id, req.user!);
  await projectsService.deleteProject(req.params.id);
  res.status(204).send();
}

export async function addMember(req: Request<{ id: string }, unknown, AddProjectMemberInput>, res: Response): Promise<void> {
  await projectsService.assertProjectAdmin(req.params.id, req.user!);
  const project = await projectsService.addMember(req.params.id, req.body);
  res.status(201).json(project);
}

export async function updateMemberRole(
  req: Request<{ id: string; userId: string }, unknown, UpdateProjectMemberRoleInput>,
  res: Response,
): Promise<void> {
  await projectsService.assertProjectAdmin(req.params.id, req.user!);
  const project = await projectsService.updateMemberRole(req.params.id, req.params.userId, req.body.role);
  res.json(project);
}

export async function removeMember(req: Request<{ id: string; userId: string }>, res: Response): Promise<void> {
  const result = await projectsService.removeMember(req.params.id, req.params.userId, req.user!);
  res.json(result);
}

export async function createSection(req: Request<{ id: string }, unknown, CreateSectionInput>, res: Response): Promise<void> {
  await projectsService.assertProjectAdmin(req.params.id, req.user!);
  const section = await projectsService.createSection(req.params.id, req.body);
  res.status(201).json(section);
}

export async function updateSection(req: Request<{ sectionId: string }, unknown, UpdateSectionInput>, res: Response): Promise<void> {
  const projectId = await projectsService.getSectionProjectId(req.params.sectionId);
  await projectsService.assertProjectAdmin(projectId, req.user!);
  const section = await projectsService.updateSection(req.params.sectionId, req.body);
  res.json(section);
}

export async function deleteSection(req: Request<{ sectionId: string }>, res: Response): Promise<void> {
  const projectId = await projectsService.getSectionProjectId(req.params.sectionId);
  await projectsService.assertProjectAdmin(projectId, req.user!);
  await projectsService.deleteSection(req.params.sectionId);
  res.status(204).send();
}
