import { createMockSource } from "./mock-source";
import type { DataSource } from "./source";

/**
 * The one place that decides where data comes from. Switching to the API
 * means adding an API `DataSource` and changing this line; screens stay as they are.
 */
export const dataSource: DataSource = createMockSource();
