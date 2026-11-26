import os from 'node:os';
import path from 'node:path';
import { SettingsStore } from '../main/features/settings/store.ts';
import { collectFiles } from '../main/features/compression/files.ts';
import { translations } from '../shared/locales.ts';
import { DATA_DIRECTORY } from '../shared/app.ts';
import type { Language, S3Credentials } from '../shared/contracts.ts';
import { CLIArgumentError, detectLanguage, parseArguments, type ParsedArguments } from './arguments.ts';

const messages: Record<Language, Record<string, string>> = {
  en: {
    'cli.usage': 'Usage: pnpm compress [options] <images or folders>\n\n--file <path>              Add an image or folder; repeat for several paths\n--quality <1..100>         Compression quality\n--overwrite | --no-overwrite\n--output <folder>          Save copies here; disables overwrite\n--format <original|png|jpeg|webp|avif>\n--webp                    Convert to WebP\n--resize <fit|cover|scale|thumb> --width <px> --height <px>\n--resize-percent <1..100>   Resize proportionally by percentage\n--no-resize                Disable saved resize settings\n--language <en|vi|ja>\n--s3                      Also upload using GUI bucket/region/prefix and AWS environment credentials\n--help, -h                Show help\n--                        Treat remaining arguments as paths\n\nUses saved GUI compression settings unless overridden. Overwrite replaces source files.\nS3 is off unless --s3 is provided. Set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY and optional AWS_SESSION_TOKEN.\nExit: 0 success, 1 processing/no images, 2 invalid arguments.',
    'cli.unknownOption': 'Unknown option: {value}', 'cli.missingValue': 'Missing value for {value}',
    'cli.flagValue': 'This option does not accept a value: {value}', 'cli.language': 'Language must be en, vi or ja.',
    'cli.inputRequired': 'Provide an image or folder. Use --help for options.',
    'cli.s3Failed': 'Saved locally; S3 upload failed.',
  },
  vi: {
    'cli.usage': 'Cách dùng: pnpm compress [tùy chọn] <ảnh hoặc thư mục>\n\n--file <đường dẫn>         Thêm ảnh hoặc thư mục; có thể lặp lại\n--quality <1..100>         Chất lượng nén\n--overwrite | --no-overwrite\n--output <thư mục>         Lưu bản sao tại đây; tắt ghi đè\n--format <original|png|jpeg|webp|avif>\n--webp                    Chuyển sang WebP\n--resize <fit|cover|scale|thumb> --width <px> --height <px>\n--resize-percent <1..100>   Resize theo phần trăm\n--no-resize                Tắt resize đã lưu\n--language <en|vi|ja>\n--s3                      Lưu thêm lên S3 bằng bucket/region/prefix của GUI và AWS credentials trong env\n--help, -h                Xem hướng dẫn\n--                        Xem các đối số còn lại là đường dẫn\n\nDùng cài đặt nén của GUI nếu không có tùy chọn ghi đè. Overwrite thay thế file gốc.\nS3 chỉ bật khi có --s3. Đặt AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY và AWS_SESSION_TOKEN nếu cần.\nMã thoát: 0 thành công, 1 lỗi xử lý/không có ảnh, 2 đối số không hợp lệ.',
    'cli.unknownOption': 'Tùy chọn không được hỗ trợ: {value}', 'cli.missingValue': 'Thiếu giá trị cho {value}',
    'cli.flagValue': 'Tùy chọn này không nhận giá trị: {value}', 'cli.language': 'Ngôn ngữ phải là en, vi hoặc ja.',
    'cli.inputRequired': 'Chọn ảnh hoặc thư mục. Dùng --help để xem tùy chọn.',
    'cli.s3Failed': 'Đã lưu cục bộ; tải lên S3 thất bại.',
  },
  ja: {
    'cli.usage': '使い方: pnpm compress [オプション] <画像またはフォルダ>\n\n--file <パス>              画像やフォルダを追加。複数指定可能\n--quality <1..100>         圧縮品質\n--overwrite | --no-overwrite\n--output <フォルダ>        コピーの保存先。上書きを無効化\n--format <original|png|jpeg|webp|avif>\n--webp                    WebPに変換\n--resize <fit|cover|scale|thumb> --width <px> --height <px>\n--resize-percent <1..100>   比率を維持してパーセントで変更\n--no-resize                保存済みのサイズ変更を無効化\n--language <en|vi|ja>\n--s3                      GUIのbucket/region/prefixとAWS環境変数でS3にも保存\n--help, -h                ヘルプを表示\n--                        残りの引数をパスとして扱う\n\n指定がなければGUIの圧縮設定を使用します。Overwriteは元のファイルを置き換えます。\nS3は--s3指定時のみ有効。AWS_ACCESS_KEY_ID、AWS_SECRET_ACCESS_KEY、必要ならAWS_SESSION_TOKENを設定します。\n終了コード: 0 成功、1 処理エラーまたは画像なし、2 引数エラー。',
    'cli.unknownOption': '未対応のオプション: {value}', 'cli.missingValue': '{value}の値がありません。',
    'cli.flagValue': 'このオプションは値を受け付けません: {value}', 'cli.language': '言語はen、vi、jaから選択してください。',
    'cli.inputRequired': '画像またはフォルダを指定してください。--helpでオプションを確認できます。',
    'cli.s3Failed': 'ローカルに保存済みですが、S3へのアップロードに失敗しました。',
  },
};

function describe(error: unknown, language: Language): string {
  const key = error instanceof Error ? error.message : String(error);
  const localized = messages[language][key] ?? translations[language][key];
  if (localized) return localized.replace('{value}', error instanceof CLIArgumentError ? error.argument ?? '' : '');
  return `${translations[language]['error.operationFailed']} ${key}`;
}

function environmentCredentials(): S3Credentials | null {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) return null;
  return { accessKeyId, secretAccessKey, ...(process.env.AWS_SESSION_TOKEN ? { sessionToken: process.env.AWS_SESSION_TOKEN } : {}) };
}

async function main(): Promise<number> {
  const settingsFile = path.join(os.homedir(), 'Library', 'Application Support', DATA_DIRECTORY, 'settings.json');
  const settings = new SettingsStore(settingsFile).value;
  const args = process.argv.slice(2);
  const language = detectLanguage(args, settings.language);
  let parsed: ParsedArguments;
  try { parsed = parseArguments(args, settings); }
  catch (error) { console.error(describe(error, language)); return 2; }
  if (parsed.help) { console.log(messages[language]['cli.usage']); return 0; }
  if (!parsed.paths.length) { console.error(messages[language]['cli.inputRequired']); return 1; }
  let files: string[];
  try { files = await collectFiles(parsed.paths); }
  catch (error) { console.error(describe(error, language)); return 1; }
  if (!files.length) { console.error(translations[language]['error.noImages']); return 1; }
  const { compressFile } = await import('../main/features/compression/compressor.ts');
  const s3 = parsed.options.s3 ? new (await import('../main/features/s3/service.ts')).S3Service({
    getOptions: () => ({ enabled: true, region: settings.s3Region, bucket: settings.s3Bucket, prefix: settings.s3Prefix }),
    getCredentials: environmentCredentials,
  }) : null;
  let exitCode = 0;
  for (const file of files) {
    try {
      const result = await compressFile(file, parsed.options);
      const status = translations[language][result.skipped ? 'queue.noReduction' : 'common.done'];
      const size = (bytes: number): string => `${new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(bytes / 1024)} KB`;
      console.log(`${status}\t${path.basename(file)}\t${size(result.originalBytes)} → ${size(result.outputBytes)}\t${result.outputPath}`);
      if (s3) {
        try { const uploaded = await s3.upload(result); console.log(`S3\t${uploaded.location}`); }
        catch (error) { console.error(`${messages[language]['cli.s3Failed']} ${result.outputPath}: ${describe(error, language)}`); exitCode = 1; }
      }
    } catch (error) { console.error(`${path.basename(file)}: ${describe(error, language)}`); exitCode = 1; }
  }
  return exitCode;
}

void main().then(code => { process.exitCode = code; }).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
