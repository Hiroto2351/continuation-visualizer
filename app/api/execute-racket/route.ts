import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

export const dynamic = 'force-dynamic';

const execAsync = promisify(exec);

export async function GET() {
  try {
    // srcフォルダを参照
    const srcDir = path.join(process.cwd(), 'src');
    const outputFile = path.join(srcDir, 'output.txt');
    
    try {
      const output = await fs.readFile(outputFile, 'utf-8');
      return NextResponse.json({
        success: true,
        output: output
      });
    } catch (readError) {
      // ファイルが存在しない場合は空の出力を返す
      return NextResponse.json({
        success: true,
        output: ''
      });
    }
  } catch (error: any) {
    console.error('output.txt読み込みエラー:', error);
    return NextResponse.json(
      { error: `ファイル読み込みエラー: ${error.message}` },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { code } = await request.json();
    
    if (!code || typeof code !== 'string') {
      return NextResponse.json(
        { error: 'コードが提供されていません' },
        { status: 400 }
      );
    }

    // srcディレクトリのinput.rktにコードを保存
    const srcDir = path.join(process.cwd(), 'src');
    const inputFile = path.join(srcDir, 'input.rkt');
    
    // ディレクトリが存在することを確認
    await fs.mkdir(srcDir, { recursive: true });
    
    // #lang racketヘッダーと(require racket/control)を追加してファイルに書き込み
    const racketContent = `#lang racket\n\n(require racket/control)\n\n${code}`;
    await fs.writeFile(inputFile, racketContent, 'utf-8');
    
    // transformer.rktを実行
    const transformerFile = path.join(srcDir, 'transformer.rkt');
    
    try {
      const { stdout, stderr } = await execAsync(`racket "${transformerFile}"`, {
        cwd: process.cwd(),
        timeout: 10000 // 10秒のタイムアウト
      });
      
      // output.txtの内容を読み込む
      const outputFile = path.join(srcDir, 'output.txt');
      const output = await fs.readFile(outputFile, 'utf-8');
      
      return NextResponse.json({
        success: true,
        output: output,
        transformerOutput: stdout,
        error: stderr || null
      });
    } catch (execError: any) {
      console.error('Racket実行エラー:', execError);
      return NextResponse.json(
        { 
          error: `Racket実行エラー: ${execError.message}`,
          stderr: execError.stderr,
          stdout: execError.stdout
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('サーバーエラー:', error);
    return NextResponse.json(
      { error: `サーバーエラー: ${error.message}` },
      { status: 500 }
    );
  }
}
