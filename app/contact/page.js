import InnerShell from '../../components/InnerShell';
import { pageMeta } from '../../lib/seo';

export const metadata = pageMeta({
  title: '联系哇塔主页：问题反馈与合作邮箱',
  description: '联系哇塔主页。网址导航、上传壁纸或分享壁纸遇到问题时，请先看使用指南，仍未解决再发邮件到 87371@qq.com。',
  path: '/contact',
});

export default function ContactPage() {
  return (
    <InnerShell
      title="联系我们"
      lead="有朋自远方来信，不亦乐乎。"
      current="/contact"
      variant="prose"
    >
      <p>
        网址导航、上传壁纸或分享壁纸遇到问题，请先查看
        {' '}
        <a href="/guide">使用指南</a>
        。
      </p>
      <p>
        如果需要其他帮助、问题仍未解决，或者你想和我们交谈，请随时联系哇塔。
      </p>
      <h2>邮件</h2>
      <p>
        <a href="mailto:87371@qq.com">87371@qq.com</a>
      </p>
      <p className="muted">
        请详细描述你遇到的问题或要沟通的事项，方便我们快速、准确地回复。
      </p>
    </InnerShell>
  );
}
