// Mock common dependencies
jest.mock("chalk", () => ({ default: (str) => str, red: (str) => str, green: (str) => str, blue: (str) => str }));
jest.mock("nanoid", () => ({ nanoid: () => "test-id" }));
jest.mock("fs", () => ({ promises: { readFile: jest.fn(), writeFile: jest.fn(), mkdir: jest.fn() } }));
/**
 * Mock storage provider implementation for testing
 */
/**
 * Creates a mock in-memory storage provider for testing
 */
export function createMockStorage() {
    const storage = new Map();
    const tasks = new Map();
    return {
        async add(content) {
            const data = typeof content === 'string' ? Buffer.from(content) : content;
            const cid = `mock-cid-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
            storage.set(cid, data);
            return cid;
        },
        async get(cid) {
            const content = storage.get(cid);
            if (!content) {
                throw new Error(`Content not found for CID: ${cid}`);
            }
            return content;
        },
        async list(options = {}) {
            const { prefix = '', limit } = options;
            let results = Array.from(storage.keys())
                .filter(cid => cid.startsWith(prefix));
            if (limit !== undefined && limit > 0) {
                results = results.slice(0, limit);
            }
            return results;
        },
        async delete(cid) {
            if (!storage.has(cid)) {
                return false;
            }
            return storage.delete(cid);
        },
        async exists(cid) {
            return storage.has(cid);
        },
        async storeTask(task) {
            if (!task.id) {
                throw new Error('Task must have an id');
            }
            tasks.set(task.id, { ...task });
        },
        async getTask(taskId) {
            return tasks.get(taskId) || null;
        },
        async updateTask(task) {
            if (!task.id) {
                throw new Error('Task must have an id');
            }
            const existing = tasks.get(task.id);
            if (!existing) {
                throw new Error(`Task not found: ${task.id}`);
            }
            tasks.set(task.id, { ...existing, ...task });
        },
        async listTasks(filter = {}) {
            let results = Array.from(tasks.values());
            // Apply filters if provided
            if (filter) {
                if (filter.status) {
                    results = results.filter(task => task.status === filter.status);
                }
                if (filter.type) {
                    results = results.filter(task => task.type === filter.type);
                }
                if (filter.priority) {
                    results = results.filter(task => task.priority === filter.priority);
                }
            }
            return results;
        },
        async clear() {
            storage.clear();
            tasks.clear();
        },
        stats() {
            let totalSize = 0;
            for (const data of storage.values()) {
                totalSize += data.length;
            }
            return {
                size: totalSize,
                items: storage.size
            };
        }
    };
}
/**
 * Creates a mock file system storage provider for testing
 */
export function createMockFileSystemStorage(baseDir) {
    const fs = require('fs/promises');
    const path = require('path');
    // Create base directories
    const contentDir = path.join(baseDir, 'content');
    const tasksDir = path.join(baseDir, 'tasks');
    // Ensure directories exist
    (async () => {
        await fs.mkdir(contentDir, { recursive: true });
        await fs.mkdir(tasksDir, { recursive: true });
    })();
    return {
        async add(content) {
            const data = typeof content === 'string' ? Buffer.from(content) : content;
            const cid = `mock-cid-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
            await fs.mkdir(contentDir, { recursive: true });
            await fs.writeFile(path.join(contentDir, cid), data);
            return cid;
        },
        async get(cid) {
            try {
                return await fs.readFile(path.join(contentDir, cid));
            }
            catch (error) {
                throw new Error(`Content not found for CID: ${cid}`);
            }
        },
        async list(options = {}) {
            const { prefix = '', limit } = options;
            await fs.mkdir(contentDir, { recursive: true });
            const files = await fs.readdir(contentDir);
            let results = files.filter(cid => cid.startsWith(prefix));
            if (limit !== undefined && limit > 0) {
                results = results.slice(0, limit);
            }
            return results;
        },
        async delete(cid) {
            try {
                await fs.unlink(path.join(contentDir, cid));
                return true;
            }
            catch (error) {
                return false;
            }
        },
        async exists(cid) {
            try {
                await fs.access(path.join(contentDir, cid));
                return true;
            }
            catch (error) {
                return false;
            }
        },
        async storeTask(task) {
            if (!task.id) {
                throw new Error('Task must have an id');
            }
            await fs.mkdir(tasksDir, { recursive: true });
            await fs.writeFile(path.join(tasksDir, `${task.id}.json`), JSON.stringify(task, null, 2));
        },
        async getTask(taskId) {
            try {
                const data = await fs.readFile(path.join(tasksDir, `${taskId}.json`), 'utf-8');
                return JSON.parse(data);
            }
            catch (error) {
                return null;
            }
        },
        async updateTask(task) {
            if (!task.id) {
                throw new Error('Task must have an id');
            }
            const taskPath = path.join(tasksDir, `${task.id}.json`);
            try {
                await fs.access(taskPath);
            }
            catch (error) {
                throw new Error(`Task not found: ${task.id}`);
            }
            // Read existing task
            const existingData = await fs.readFile(taskPath, 'utf-8');
            const existingTask = JSON.parse(existingData);
            // Update task
            const updatedTask = { ...existingTask, ...task };
            // Write updated task
            await fs.writeFile(taskPath, JSON.stringify(updatedTask, null, 2));
        },
        async listTasks(filter = {}) {
            await fs.mkdir(tasksDir, { recursive: true });
            const files = await fs.readdir(tasksDir);
            const tasks = await Promise.all(files
                .filter(file => file.endsWith('.json'))
                .map(async (file) => {
                const data = await fs.readFile(path.join(tasksDir, file), 'utf-8');
                return JSON.parse(data);
            }));
            // Apply filters if provided
            let results = tasks;
            if (filter) {
                if (filter.status) {
                    results = results.filter(task => task.status === filter.status);
                }
                if (filter.type) {
                    results = results.filter(task => task.type === filter.type);
                }
                if (filter.priority) {
                    results = results.filter(task => task.priority === filter.priority);
                }
            }
            return results;
        },
        async clear() {
            // Remove all content files
            try {
                const contentFiles = await fs.readdir(contentDir);
                await Promise.all(contentFiles.map(file => fs.unlink(path.join(contentDir, file))));
            }
            catch (error) {
                // Ignore errors if directory doesn't exist
            }
            // Remove all task files
            try {
                const taskFiles = await fs.readdir(tasksDir);
                await Promise.all(taskFiles.map(file => fs.unlink(path.join(tasksDir, file))));
            }
            catch (error) {
                // Ignore errors if directory doesn't exist
            }
        },
        async stats() {
            try {
                await fs.mkdir(contentDir, { recursive: true });
                const files = await fs.readdir(contentDir);
                let totalSize = 0;
                for (const file of files) {
                    const stats = await fs.stat(path.join(contentDir, file));
                    totalSize += stats.size;
                }
                return {
                    size: totalSize,
                    items: files.length
                };
            }
            catch (error) {
                return { size: 0, items: 0 };
            }
        }
    };
}
//# sourceMappingURL=mockStorage.js.map