# 测试结果

## 测试环境

|项|配置|
|-|-|
|CPU|2.3 GHz 双核Intel Core i5|
|内存|8 GB 2133 MHz LPDDR3|
|磁盘|本地120G SSD盘，PCIe，apfs文件系统|
|设置|同步写入，16路并发，开启zstd压缩，秒传级别`FULL`，其余默认|

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
		sdk := New(core.NewLocalHandler())
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
		sdk := New(core.NewLocalHandler())
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
|速率|上传3.94秒 ≈2538.07 pcs/s，下载2.78秒 ≈3597.12 pcs/s|
|空间|原始文件夹39MB，写入数据23B(*磁盘占用要看文件系统分块情况)、元数据996KB|

```sh
/usr/local/go/bin/go test github.com/orcastor/orcas/sdk -v
=== RUN   TestUpload
--- PASS: TestUpload (3.94s)
=== RUN   TestDownload
--- PASS: TestDownload (2.78s)
=== RUN   TestCheck
--- PASS: TestCheck (1.29s)
PASS
ok  	github.com/orcastor/orcas/sdk	8.102s
```

读写改成USB3.0外挂移动硬盘，西数 2T HDD，exFAT文件系统
> 上传9秒 ≈1111 pcs/s，下载3秒 ≈3333 pcs/s

## 大文件

### 准备了16个144.44MB大小的文件（2.32GB）

|项|结果|
|-|-|
|速率|上传4.77秒 ≈486.37 MB/s，下载2.95秒 ≈786.44 MB/s|
|空间|原始文件夹2.32GB，写入后2.32GB|

```sh
/usr/local/go/bin/go test github.com/orcastor/orcas/sdk -v
=== RUN   TestUpload
--- PASS: TestUpload (4.77s)
=== RUN   TestDownload
--- PASS: TestDownload (2.95s)
=== RUN   TestCheck
--- PASS: TestCheck (3.86s)
PASS
ok  	github.com/orcastor/orcas/sdk	12.045s
```

读写改成USB3.0外挂移动硬盘，西数 2T HDD，exFAT文件系统
> 上传21秒 ≈110.48 MB/s，下载13秒 ≈178.46 MB/s

## 待改进

后续和同类开源库做对比benchmark。目前第一版涉及的测试场景只有一次性的写入和读取，实际场景会有热点数据的访问等，需要考虑缓存文件句柄优化频繁读写，配合[ecache](https://github.com/orca-zhang/ecache)优化起来也会很方便。

为了减少网络请求，秒传部分可以考虑在服务端和客户端引入双hash布隆过滤器。

单个大文件可以优化为双缓冲或者并发上传下载，单个小文件上传可以考虑优化为先写到服务端WAL文件，并由其进行打包。
