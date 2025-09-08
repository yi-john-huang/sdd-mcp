import { injectable } from 'inversify';
import { TaskTracker } from '../../domain/ports.js';
import { Task } from '../../domain/types.js';

@injectable()
export class FileBasedTaskTracker implements TaskTracker {
  private readonly tasks = new Map<string, Task[]>();

  async getTasks(projectId: string): Promise<Task[]> {
    return this.tasks.get(projectId) ?? [];
  }

  async updateTask(projectId: string, taskId: string, completed: boolean): Promise<void> {
    const projectTasks = this.tasks.get(projectId) ?? [];
    const taskIndex = projectTasks.findIndex(task => task.id === taskId);
    
    if (taskIndex >= 0) {
      projectTasks[taskIndex] = { ...projectTasks[taskIndex], completed };
      this.tasks.set(projectId, projectTasks);
    }
  }

  async addTask(projectId: string, task: Omit<Task, 'id'>): Promise<Task> {
    const newTask: Task = {
      ...task,
      id: `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
    
    const projectTasks = this.tasks.get(projectId) ?? [];
    projectTasks.push(newTask);
    this.tasks.set(projectId, projectTasks);
    
    return newTask;
  }

  async removeTask(projectId: string, taskId: string): Promise<void> {
    const projectTasks = this.tasks.get(projectId) ?? [];
    const filteredTasks = projectTasks.filter(task => task.id !== taskId);
    this.tasks.set(projectId, filteredTasks);
  }
}