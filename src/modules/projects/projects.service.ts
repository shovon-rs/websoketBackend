import { prisma } from '../../config/database';
import { AuthenticatedUser } from '../../types/ws';
import { hasRole } from '../../utils/roles';
import {
  AddProjectMemberInput,
  CreateProjectInput,
  CreateSectionInput,
  UpdateProjectInput,
  UpdateSectionInput,
} from './projects.schemas';

const USER_SELECT = { id: true, displayName: true, email: true } as const;

async function getProjectOrThrow(projectId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId }, include: { members: true } });
  if (!project) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });
  return project;
}

/** Visibility rule: manager+ see every project; a plain user only sees projects they're a member of. */
export async function assertCanViewProject(projectId: string, actor: AuthenticatedUser): Promise<void> {
  if (hasRole(actor.role, 'manager')) return;
  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: actor.id } },
  });
  if (!member) throw Object.assign(new Error('FORBIDDEN'), { status: 403 });
}

/** Only manager+ or a project admin may rename/delete the project, manage members/sections, or manage its tasks. */
export async function assertProjectAdmin(projectId: string, actor: AuthenticatedUser): Promise<void> {
  if (hasRole(actor.role, 'manager')) return;
  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: actor.id } },
  });
  if (!member || member.role !== 'admin') throw Object.assign(new Error('FORBIDDEN'), { status: 403 });
}

export async function listProjects(actor: AuthenticatedUser) {
  return prisma.project.findMany({
    where: hasRole(actor.role, 'manager') ? {} : { members: { some: { userId: actor.id } } },
    include: {
      _count: { select: { members: true, sections: true, tasks: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getProject(projectId: string) {
  return prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    include: {
      members: { include: { user: { select: USER_SELECT } } },
      sections: { orderBy: { order: 'asc' } },
    },
  });
}

export async function createProject(actor: AuthenticatedUser, input: CreateProjectInput) {
  const project = await prisma.$transaction(async (tx) => {
    const created = await tx.project.create({
      data: {
        name: input.name,
        description: input.description,
        color: input.color,
        creatorId: actor.id,
        members: { create: { userId: actor.id, role: 'admin' } },
      },
    });
    return created;
  });
  return getProject(project.id);
}

export async function updateProject(projectId: string, input: UpdateProjectInput) {
  await getProjectOrThrow(projectId);
  return prisma.project.update({ where: { id: projectId }, data: input });
}

export async function deleteProject(projectId: string): Promise<void> {
  await getProjectOrThrow(projectId);
  await prisma.project.delete({ where: { id: projectId } });
}

export async function addMember(projectId: string, input: AddProjectMemberInput) {
  const project = await getProjectOrThrow(projectId);
  const existing = project.members.find((m) => m.userId === input.userId);
  if (existing) throw Object.assign(new Error('ALREADY_MEMBER'), { status: 409 });

  await prisma.projectMember.create({ data: { projectId, userId: input.userId, role: input.role } });
  return getProject(projectId);
}

/** Demoting the last remaining admin is refused — a project must always have at least one. */
export async function updateMemberRole(projectId: string, targetUserId: string, role: 'admin' | 'member') {
  const project = await getProjectOrThrow(projectId);
  const target = project.members.find((m) => m.userId === targetUserId);
  if (!target) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });

  if (role === 'member' && target.role === 'admin') {
    const otherAdmins = project.members.filter((m) => m.role === 'admin' && m.userId !== targetUserId);
    if (otherAdmins.length === 0) throw Object.assign(new Error('LAST_ADMIN'), { status: 409 });
  }

  await prisma.projectMember.update({
    where: { projectId_userId: { projectId, userId: targetUserId } },
    data: { role },
  });
  return getProject(projectId);
}

/**
 * A member may remove only themself (leave, if not the sole admin — see below); a project
 * admin may remove anyone. If a removal leaves the project with members but no remaining
 * admin, the earliest-added survivor is auto-promoted — otherwise the project would become
 * permanently unmanageable, mirroring chat's group-admin departure rule.
 */
export async function removeMember(projectId: string, targetUserId: string, actor: AuthenticatedUser) {
  const project = await getProjectOrThrow(projectId);

  const isSelfLeaving = targetUserId === actor.id;
  if (!isSelfLeaving) {
    await assertProjectAdmin(projectId, actor);
  }

  const targetMember = project.members.find((m) => m.userId === targetUserId);
  if (!targetMember) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });

  await prisma.projectMember.delete({ where: { projectId_userId: { projectId, userId: targetUserId } } });

  const remaining = project.members.filter((m) => m.userId !== targetUserId);
  const hasRemainingAdmin = remaining.some((m) => m.role === 'admin');
  let promotedAdminId: string | null = null;

  if (remaining.length > 0 && !hasRemainingAdmin) {
    const nextAdmin = [...remaining].sort((a, b) => a.addedAt.getTime() - b.addedAt.getTime())[0];
    await prisma.projectMember.update({
      where: { projectId_userId: { projectId, userId: nextAdmin.userId } },
      data: { role: 'admin' },
    });
    promotedAdminId = nextAdmin.userId;
  }

  return { promotedAdminId };
}

export async function createSection(projectId: string, input: CreateSectionInput) {
  const maxOrder = await prisma.section.aggregate({ where: { projectId }, _max: { order: true } });
  return prisma.section.create({
    data: { projectId, name: input.name, order: (maxOrder._max.order ?? -1) + 1 },
  });
}

async function getSectionOrThrow(sectionId: string) {
  const section = await prisma.section.findUnique({ where: { id: sectionId } });
  if (!section) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });
  return section;
}

export async function getSectionProjectId(sectionId: string): Promise<string> {
  const section = await getSectionOrThrow(sectionId);
  return section.projectId;
}

export async function updateSection(sectionId: string, input: UpdateSectionInput) {
  await getSectionOrThrow(sectionId);
  return prisma.section.update({ where: { id: sectionId }, data: input });
}

export async function deleteSection(sectionId: string): Promise<void> {
  await getSectionOrThrow(sectionId);
  await prisma.section.delete({ where: { id: sectionId } });
}
