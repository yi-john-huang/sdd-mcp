import { injectable } from 'inversify';
import { Project } from '../../domain/types.js';
import { ProjectRepository } from '../../domain/ports.js';

@injectable()
export class InMemoryProjectRepository implements ProjectRepository {
  private readonly projects = new Map<string, Project>();

  async save(project: Project): Promise<void> {
    this.projects.set(project.id, project);
  }

  async findById(id: string): Promise<Project | null> {
    return this.projects.get(id) ?? null;
  }

  async findByPath(path: string): Promise<Project | null> {
    for (const project of this.projects.values()) {
      if (project.path === path) {
        return project;
      }
    }
    return null;
  }

  async list(): Promise<Project[]> {
    return Array.from(this.projects.values());
  }

  async delete(id: string): Promise<void> {
    this.projects.delete(id);
  }
}