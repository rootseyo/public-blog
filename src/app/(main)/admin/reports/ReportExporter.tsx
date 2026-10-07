'use client';

import React, { useState } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { Download, FileImage, FileText, Loader2 } from 'lucide-react';
import styles from '../admin.module.css';

interface ReportExporterProps {
  elementId: string;
  reportTitle: string;
}

export default function ReportExporter({ elementId, reportTitle }: ReportExporterProps) {
  const [isExporting, setIsExporting] = useState<string | null>(null);

  const exportAsPNG = async () => {
    const element = document.getElementById(elementId);
    if (!element) return;

    try {
      setIsExporting('png');
      // 차트가 완전히 렌더링될 시간을 줌
      await new Promise(resolve => setTimeout(resolve, 500));

      const canvas = await html2canvas(element, {
        scale: 2, // 고해상도
        useCORS: true,
        logging: false,
        backgroundColor: window.getComputedStyle(document.body).backgroundColor || '#ffffff'
      });

      const image = canvas.toDataURL('image/png', 1.0);
      const link = document.createElement('a');
      link.download = `${reportTitle}_${new Date().toISOString().split('T')[0]}.png`;
      link.href = image;
      link.click();
    } catch (error) {
      console.error('PNG Export failed:', error);
      alert('PNG 내보내기에 실패했습니다.');
    } finally {
      setIsExporting(null);
    }
  };

  const exportAsPDF = async () => {
    const element = document.getElementById(elementId);
    if (!element) return;

    try {
      setIsExporting('pdf');
      await new Promise(resolve => setTimeout(resolve, 500));

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: window.getComputedStyle(document.body).backgroundColor || '#ffffff'
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'px',
        format: [canvas.width, canvas.height]
      });

      pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
      pdf.save(`${reportTitle}_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (error) {
      console.error('PDF Export failed:', error);
      alert('PDF 내보내기에 실패했습니다.');
    } finally {
      setIsExporting(null);
    }
  };

  return (
    <div className={styles.exportButtons}>
      <button 
        onClick={exportAsPNG} 
        disabled={!!isExporting}
        className={styles.exportButton}
        title="PNG로 저장"
      >
        {isExporting === 'png' ? <Loader2 className={styles.spinning} size={18} /> : <FileImage size={18} />}
        <span>PNG</span>
      </button>
      <button 
        onClick={exportAsPDF} 
        disabled={!!isExporting}
        className={styles.exportButton}
        title="PDF로 저장"
      >
        {isExporting === 'pdf' ? <Loader2 className={styles.spinning} size={18} /> : <FileText size={18} />}
        <span>PDF</span>
      </button>
    </div>
  );
}
