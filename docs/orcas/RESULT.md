# 测试结果

|项|配置|
|-|-|
|CPU|2.3 GHz 双核Intel Core i5|
|内存|8 GB 2133 MHz LPDDR3|
|磁盘|PCI-Express本地 120G SSD盘，apfs文件系统|
|设置|同步写入，16路并发，开启zstd压缩，秒传`FULL`，其余默认|

## 测试代码

### 设置

```go
var cfg = Config{
	DataSync: true,
	RefLevel: FULL,
	WiseCmpr: core.DATA_CMPR_ZSTD,
	DontSync: ".*",
	WorkersN: 16,
}
```

### 上传

```go
func TestUpload(t *testing.T) {
	Convey("upload dir", t, func() {
		c := context.TODO()
		sdk := New(core.NewRWHandler())
		defer sdk.Close()

		sdk.SetConfig(cfg)
		So(sdk.Upload(c, bktID, core.ROOT_OID, path), ShouldBeNil)
	})
}
```

### 下载

```go
func TestDownload(t *testing.T) {
	Convey("download dir", t, func() {
		c := context.TODO()
		sdk := New(core.NewRWHandler())
		defer sdk.Close()

		sdk.SetConfig(cfg)
		id, _ := sdk.Path2ID(c, bktID, core.ROOT_OID, filepath.Base(path))

		So(sdk.Download(c, bktID, id, mntPath), ShouldBeNil)
	})
}
```

## 小文件

### 准备了1W个相同内容的4K小文件

|项|结果|
|-|-|
|速率|上传4.79秒 ≈2087.68 iter/s，下载3.71秒 ≈2695.42 iter/s|
|空间|原始文件夹39MB，写入数据23B(*磁盘占用要看文件系统分块情况)、元数据1.1MB|

```shell
/usr/local/go/bin/go test github.com/orcastor/orcas/sdk -v=== RUN   TestUpload
=== RUN   TestUpload
--- PASS: TestUpload (4.79s)
=== RUN   TestDownload
--- PASS: TestDownload (3.71s)
=== RUN   TestCheck
--- PASS: TestCheck (0.90s)
PASS
ok  	github.com/orcastor/orcas/sdk	9.481s
```

读写改成SATA盘，USB2.0外挂移动硬盘，西数 2T HDD，exFAT文件系统
> 上传9秒 ≈1111 iter/s，下载3秒 ≈3333 iter/s

## 大文件

### 准备了2个dmg文件（1.07GB + 920.8MB）

|项|结果|
|-|-|
|速率|上传9.77秒 ≈208.57 MB/s，下载7.30秒 ≈279.15 MB/s|
|空间|原始文件夹1.99GB，写入后1.8GB|

```shell
/usr/local/go/bin/go test github.com/orcastor/orcas/sdk -v
=== RUN   TestUpload
--- PASS: TestUpload (9.77s)
=== RUN   TestDownload
--- PASS: TestDownload (7.30s)
=== RUN   TestCheck
--- PASS: TestCheck (5.85s)
PASS
ok  	github.com/orcastor/orcas/sdk	22.965s
```

读写改成SATA盘，USB2.0外挂移动硬盘，西数 2T HDD，exFAT文件系统
> 上传20秒 ≈101.88 MB/s，下载12秒 ≈169.81 MB/s