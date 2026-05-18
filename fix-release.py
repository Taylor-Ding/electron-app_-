#!/usr/bin/env python3
import subprocess
import sys

def run_command(cmd, cwd=None):
    """运行命令并返回结果"""
    try:
        result = subprocess.run(
            cmd,
            shell=True,
            capture_output=True,
            text=True,
            cwd=cwd
        )
        print(f"执行命令: {cmd}")
        print(f"输出: {result.stdout}")
        if result.stderr:
            print(f"错误: {result.stderr}")
        return result.returncode == 0, result.stdout, result.stderr
    except Exception as e:
        print(f"命令执行失败: {e}")
        return False, "", str(e)

def main():
    project_dir = "/Users/jinweizhu/project/document/autotest/python_proj/electron-app"
    
    print("=== 修正发布流程 ===")
    
    # 1. 添加 .gitignore
    print("\n1. 更新 .gitignore")
    run_command("git add .gitignore", cwd=project_dir)
    
    # 2. 修正提交
    print("\n2. 修正提交")
    run_command("git commit --amend --no-edit", cwd=project_dir)
    
    # 3. 删除之前的标签
    print("\n3. 删除之前的标签")
    run_command("git tag -d v1.0.16", cwd=project_dir)
    
    # 4. 重新创建标签
    print("\n4. 重新创建标签")
    run_command('git tag -a v1.0.16 -m "Release v1.0.16: 修复表依赖查询功能"', cwd=project_dir)
    
    # 5. 尝试推送
    print("\n5. 尝试推送到远程")
    print("注意: 如果网络有问题，您可能需要手动执行以下命令:")
    print("  git push origin main --force-with-lease")
    print("  git push origin v1.0.16 --force")
    
    # 先尝试推送
    success, _, _ = run_command("git push origin main --force-with-lease", cwd=project_dir)
    
    if success:
        print("main 分支推送成功！")
        run_command("git push origin v1.0.16", cwd=project_dir)
        print("\n=== 完成！===")
    else:
        print("\n=== 推送失败，请检查网络连接后手动执行上述命令 ===")
    
    return 0

if __name__ == "__main__":
    sys.exit(main())
