/** Tasks outside Y.Doc that must settle before an embedded editor can close. */
class DocumentTasks {
  pending = new Set<Promise<unknown>>();
  titleTail: Promise<unknown> = Promise.resolve();
  failedTitle?: () => Promise<unknown>;

  async track<T>(operation: () => Promise<T>): Promise<T> {
    const task = Promise.resolve().then(operation);
    this.pending.add(task);
    try {
      return await task;
    } finally {
      this.pending.delete(task);
    }
  }

  async settle() {
    while (this.pending.size) {
      await Promise.allSettled([...this.pending]);
    }
    if (this.failedTitle) {
      // A timed-out close may resume editing while this retry is still running.
      // Keep retries on the same queue so a newer title always lands last.
      await queueTitle(this, this.failedTitle);
    }
  }
}

const documents = new Map<string, DocumentTasks>();
const tasksFor = (docId: string) => {
  let tasks = documents.get(docId);
  if (!tasks) {
    tasks = new DocumentTasks();
    documents.set(docId, tasks);
  }
  return tasks;
};

export const trackEditorUpload = <T>(
  docId: string,
  operation: () => Promise<T>,
) => documents.get(docId)?.track(operation) ?? operation();

// Comment composers keep their content until REST succeeds. Wait for their
// requests before inspecting drafts; never automatically retry a comment POST.
export const trackEditorComment = trackEditorUpload;
export const trackEditorRestore = trackEditorUpload;

export const trackEditorTitle = <T>(
  docId: string,
  operation: () => Promise<T>,
) => {
  const tasks = documents.get(docId);
  if (!tasks) {
    return operation();
  }
  return queueTitle(tasks, operation);
};

const queueTitle = <T>(tasks: DocumentTasks, operation: () => Promise<T>) => {
  const previous = tasks.titleTail;
  const task = tasks.track(async () => {
    await previous.catch(() => undefined);
    try {
      const result = await operation();
      tasks.failedTitle = undefined;
      return result;
    } catch (error) {
      tasks.failedTitle = operation;
      throw error;
    }
  });
  tasks.titleTail = task.catch(() => undefined);
  return task;
};

export const settleEditorTasks = (docId: string) => tasksFor(docId).settle();
export const activateEditorTasks = (docId: string) => {
  tasksFor(docId);
};

/** Called when the owning editor leaves; pending promises retain their own instance. */
export const releaseEditorTasks = (docId: string) => documents.delete(docId);
