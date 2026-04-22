/**
 * MySQL → SQLite 一次性数据迁移脚本
 *
 * 从本机 MySQL 读取 automation_sets、coordinate_actions、button_actions、scroll_actions 四张表数据，
 * 写入 SQLite 数据库 ~/.ai_secretary/sqlite/motor.db
 *
 * 用法：npx ts-node -r tsconfig-paths/register scripts/migrate-mysql-to-sqlite.ts
 */
import { join } from 'path';
import { homedir } from 'os';

// 动态导入，避免未安装时报错
async function main() {
  const mysql = await import('mysql2/promise');
  const Database = (await import('better-sqlite3')).default;

  const DB_PATH = join(homedir(), '.ai_secretary', 'sqlite', 'motor.db');

  // MySQL 连接配置（根据实际环境修改）
  const MYSQL_CONFIG = {
    host: '127.0.0.1',
    port: 3306,
    user: 'root',
    password: 'password',
    database: 'project',
  };

  console.log('=== MySQL → SQLite 数据迁移 ===');
  console.log(`SQLite 路径: ${DB_PATH}`);

  // 连接 MySQL
  const mysqlConn = await mysql.createConnection(MYSQL_CONFIG);
  console.log('已连接 MySQL');

  // 连接 SQLite
  const sqlite = new Database(DB_PATH);
  sqlite.pragma('journal_mode = WAL');
  console.log('已连接 SQLite');

  // 迁移单张表
  async function migrateTable(tableName: string, columns: string[]) {
    const colList = columns.join(', ');
    const placeholders = columns.map(() => '?').join(', ');

    const [rows] = await mysqlConn.query(`SELECT ${colList} FROM \`${tableName}\``) as [any[], any];
    console.log(`${tableName}: 读取到 ${rows.length} 条记录`);

    if (rows.length === 0) return;

    const insert = sqlite.prepare(`INSERT OR REPLACE INTO ${tableName} (${colList}) VALUES (${placeholders})`);
    const transaction = sqlite.transaction(() => {
      for (const row of rows) {
        const values = columns.map((col) => {
          const val = row[col];
          if (val === null || val === undefined) return null;
          // Date → ISO 字符串
          if (val instanceof Date) return val.toISOString();
          // JSON 字段序列化
          if (col === 'extra_data' && typeof val === 'object') {
            return JSON.stringify(val);
          }
          // Buffer → 字符串（极少数情况）
          if (Buffer.isBuffer(val)) return val.toString('utf-8');
          return val;
        });
        insert.run(...values);
      }
    });

    transaction();
    console.log(`${tableName}: 写入完成`);
  }

  // 使用 await 的 migrateTable 需要在 async 函数中
  const tables: Record<string, string[]> = {
    automation_sets: ['id', 'name', 'description', 'platform', 'created_at', 'updated_at', 'is_delete'],
    coordinate_actions: ['id', 'set_id', 'step_index', 'x', 'y', 'action_type', 'wait_time', 'label', 'screenshot_path', 'extra_data', 'created_at', 'updated_at', 'is_delete'],
    button_actions: ['id', 'set_id', 'step_index', 'button_type', 'key_combination', 'wait_time', 'label', 'screenshot_path', 'extra_data', 'created_at', 'updated_at', 'is_delete'],
    scroll_actions: ['id', 'set_id', 'step_index', 'direction', 'distance', 'duration', 'wait_time', 'label', 'screenshot_path', 'extra_data', 'created_at', 'updated_at', 'is_delete'],
  };

  for (const [table, cols] of Object.entries(tables)) {
    await migrateTable(table, cols);
  }

  // 验证
  console.log('\n=== 验证数据 ===');
  for (const table of Object.keys(tables)) {
    const count = (sqlite.prepare(`SELECT COUNT(*) as count FROM ${table}`).get() as any).count;
    console.log(`${table}: ${count} 条记录`);
  }

  mysqlConn.end();
  sqlite.close();
  console.log('\n迁移完成!');
}

main().catch((err) => {
  console.error('迁移失败:', err);
  process.exit(1);
});
